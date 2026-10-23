import type { ConnectionLogEntry, ConnectionLogPayload } from "@/types";
import { fromRelayMessage, unavailable, type ConnectFailure } from "./errors";
import type { Blocked } from "./origin";
import type {
  HostKeyData,
  ShellChannel,
  ShellOptions,
  TerminalHostConfig,
  Transport,
  TransportKind,
} from "./types";

/** Something the connection waits on the user for. */
export type ConnectionPrompt =
  | { kind: "totp"; prompt: string; isPassword: boolean }
  | { kind: "auth"; reason: "no_keyboard" | "auth_failed" | "timeout" }
  | { kind: "hostKey"; scenario: "new" | "changed"; data: HostKeyData }
  | { kind: "passphrase" }
  | { kind: "warpgate"; url: string; securityKey: string }
  | { kind: "browserCheck"; url: string; message: string };

export type ConnectionStatus =
  | { status: "idle" }
  | {
      status: "connecting";
      origin: TransportKind;
      /** Index into the plan's attempts. */
      attempt: number;
      /** Reconnect try after a drop, 0 for the first connect. */
      retry: number;
    }
  | { status: "prompt"; origin: TransportKind; prompt: ConnectionPrompt }
  | { status: "connected"; origin: TransportKind; hasData: boolean }
  | { status: "failed"; failure: ConnectFailure; fix?: Blocked["fix"] }
  | { status: "closed" };

export type ConnectionEvent =
  | { type: "start"; origin: TransportKind; attempt: number }
  | { type: "connecting"; retry: number }
  | { type: "prompt"; prompt: ConnectionPrompt }
  | { type: "answered" }
  | { type: "connected" }
  | { type: "data" }
  | { type: "failed"; failure: ConnectFailure; fix?: Blocked["fix"] }
  | { type: "closed" }
  | { type: "reset" };

const originOf = (s: ConnectionStatus): TransportKind | null =>
  "origin" in s ? s.origin : null;

/** The pure part of the state machine. Returns the same object when nothing changed. */
export function reduceConnection(
  s: ConnectionStatus,
  e: ConnectionEvent,
): ConnectionStatus {
  switch (e.type) {
    case "reset":
      return { status: "idle" };
    case "start":
      return {
        status: "connecting",
        origin: e.origin,
        attempt: e.attempt,
        retry: 0,
      };
    case "connecting": {
      const origin = originOf(s);
      if (!origin) return s;
      const attempt = s.status === "connecting" ? s.attempt : 0;
      if (s.status === "connecting" && s.retry === e.retry) return s;
      return { status: "connecting", origin, attempt, retry: e.retry };
    }
    case "prompt": {
      const origin = originOf(s);
      if (!origin || s.status === "failed" || s.status === "closed") return s;
      return { status: "prompt", origin, prompt: e.prompt };
    }
    case "answered": {
      if (s.status !== "prompt") return s;
      return { status: "connecting", origin: s.origin, attempt: 0, retry: 0 };
    }
    case "connected": {
      const origin = originOf(s);
      if (!origin) return s;
      // A Tailscale check may still show while the shell opens.
      return { status: "connected", origin, hasData: false };
    }
    case "data":
      if (s.status !== "connected" || s.hasData) return s;
      return { ...s, hasData: true };
    case "failed":
      return { status: "failed", failure: e.failure, fix: e.fix };
    case "closed":
      return { status: "closed" };
  }
}

export interface PlannedAttempts {
  attempts: Transport[];
  blocked?: Blocked;
}

export interface HostConnectionOptions {
  host: TerminalHostConfig;
  /** Which ways to try. Asked again on every connect and retry. */
  plan: () => Promise<PlannedAttempts>;
  tabInstanceId?: string;
  initialSessionId?: string | null;
  /** Connect timeout for a try that has a fallback after it. */
  fallbackTimeoutSecs?: number;
  onData: (data: string) => void;
  onConnected?: (info: {
    fromBackground: boolean;
    isReattach: boolean;
  }) => void;
  onPostConnectionSetup?: () => void;
  onDisconnected?: (hostName: string) => void;
  onSessionIdChange?: (sessionId: string | null) => void;
  /** Fires when a try starts, with the way it goes. */
  onOriginResolved?: (kind: TransportKind) => void;
}

export interface ConnectionSnapshot {
  state: ConnectionStatus;
  log: ConnectionLogEntry[];
}

const FALLBACK_STAGES = new Set(["network"]);

let logSeq = 0;

/**
 * One connection to a host, for either transport. Owns the shell channel,
 * the prompts it raises, the connection log and the fallback from the phone
 * to the server. Screens render its state and call its answer methods.
 */
export class HostConnection {
  private snapshot: ConnectionSnapshot = {
    state: { status: "idle" },
    log: [],
  };
  private listeners = new Set<() => void>();
  private channel: ShellChannel | null = null;
  private attempts: Transport[] = [];
  private attempt = 0;
  private prompted = false;
  private cols = 80;
  private rows = 24;
  private sessionId: string | null;
  private destroyed = false;
  private run = 0;

  constructor(private readonly options: HostConnectionOptions) {
    this.sessionId = options.initialSessionId ?? null;
  }

  // Store

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  get state(): ConnectionStatus {
    return this.snapshot.state;
  }

  private set(next: ConnectionSnapshot) {
    if (next === this.snapshot) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private dispatch(event: ConnectionEvent) {
    const state = reduceConnection(this.snapshot.state, event);
    if (state !== this.snapshot.state) this.set({ ...this.snapshot, state });
  }

  log(payload: ConnectionLogPayload) {
    const entry: ConnectionLogEntry = {
      ...payload,
      id: `log_${++logSeq}`,
      timestamp: Date.now(),
    };
    this.set({ ...this.snapshot, log: [...this.snapshot.log, entry] });
  }

  clearLog = () => {
    if (this.snapshot.log.length) this.set({ ...this.snapshot, log: [] });
  };

  // Connecting

  /** Called when the terminal knows its size. Starts the first try. */
  async connect(cols: number, rows: number): Promise<void> {
    this.cols = cols;
    this.rows = rows;
    if (this.channel) {
      // A second ready from the view: the shell is already up.
      this.channel.sendResize(cols, rows);
      return;
    }
    if (this.state.status !== "idle") return;
    await this.start();
  }

  /** Starts over with a fresh plan (after a failure, or an origin change). */
  async retry(): Promise<void> {
    this.dropChannel();
    this.clearLog();
    this.dispatch({ type: "reset" });
    await this.start();
  }

  private async start() {
    const run = ++this.run;
    let planned: PlannedAttempts;
    try {
      planned = await this.options.plan();
    } catch (err) {
      if (run !== this.run || this.destroyed) return;
      this.failWith(
        unavailable(err instanceof Error ? err.message : String(err)),
      );
      return;
    }
    if (run !== this.run || this.destroyed) return;
    this.attempts = planned.attempts;
    if (!this.attempts.length) {
      const blocked = planned.blocked ?? { reason: "Can't connect." };
      this.failWith(unavailable(blocked.reason), blocked.fix);
      return;
    }
    this.open(0);
  }

  private open(index: number) {
    const transport = this.attempts[index];
    this.attempt = index;
    this.prompted = false;
    this.dispatch({ type: "start", origin: transport.kind, attempt: index });
    const name = this.options.host.name || this.options.host.ip;
    this.log({
      level: "info",
      stage: "connection",
      message:
        transport.kind === "local"
          ? `Connecting to ${name} from this phone`
          : `Connecting to ${name} through the server`,
    });
    this.options.onOriginResolved?.(transport.kind);
    const hasFallback = index < this.attempts.length - 1;
    try {
      this.channel = transport.openShell(this.shellOptions(hasFallback));
    } catch (err) {
      this.channel = null;
      this.onFailed(
        err instanceof Error ? err.message : String(err),
        unavailable(err instanceof Error ? err.message : String(err)),
      );
      return;
    }
    this.channel.connect(this.cols, this.rows).catch((err) => {
      this.onFailed(String(err));
    });
  }

  private shellOptions(hasFallback: boolean): ShellOptions {
    const channelAt = this.run;
    const live = () => !this.destroyed && channelAt === this.run;
    const guard =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (live()) fn(...args);
      };
    return {
      hostConfig: this.options.host,
      tabInstanceId: this.options.tabInstanceId,
      initialSessionId: this.sessionId,
      connectTimeoutSecs: hasFallback
        ? (this.options.fallbackTimeoutSecs ?? 8)
        : undefined,
      onSessionIdChange: guard((id) => {
        this.sessionId = id;
        this.options.onSessionIdChange?.(id);
      }),
      onStateChange: guard((state, data) => {
        switch (state) {
          case "connecting": {
            const retry = (data?.retryCount as number) || 0;
            if (retry > 0) {
              this.log({
                level: "info",
                stage: "connection",
                message: `Reconnecting (try ${retry})`,
              });
            }
            this.dispatch({ type: "connecting", retry });
            break;
          }
          case "connected":
            this.log({
              level: "success",
              stage: "connection",
              message: "Connected",
            });
            this.dispatch({ type: "connected" });
            this.options.onConnected?.({
              fromBackground: !!data?.fromBackground,
              isReattach: !!data?.isReattach,
            });
            break;
          case "dataReceived":
            this.dispatch({ type: "data" });
            break;
        }
      }),
      onData: guard((data) => this.options.onData(data)),
      onTotpRequired: guard((prompt, isPassword) =>
        this.ask({ kind: "totp", prompt, isPassword }),
      ),
      onAuthDialogNeeded: guard((reason) => this.ask({ kind: "auth", reason })),
      onHostKeyVerificationRequired: guard((scenario, data) =>
        this.ask({ kind: "hostKey", scenario, data }),
      ),
      onPassphraseRequired: guard(() => this.ask({ kind: "passphrase" })),
      onWarpgateAuthRequired: guard((url, securityKey) =>
        this.ask({ kind: "warpgate", url, securityKey }),
      ),
      onBrowserCheckRequired: guard((url, message) =>
        this.ask({ kind: "browserCheck", url, message }),
      ),
      onBrowserCheckCompleted: guard(() => {
        const s = this.state;
        if (s.status === "prompt" && s.prompt.kind === "browserCheck") {
          this.dispatch({ type: "answered" });
        }
      }),
      onPostConnectionSetup: guard(() =>
        this.options.onPostConnectionSetup?.(),
      ),
      onDisconnected: guard((hostName) => {
        this.log({
          level: "warning",
          stage: "connection",
          message: "Disconnected",
        });
        this.dropChannel();
        this.dispatch({ type: "closed" });
        this.options.onDisconnected?.(hostName);
      }),
      onConnectionFailed: guard((message, failure) =>
        this.onFailed(message, failure),
      ),
      onConnectionLog: guard((entry) =>
        this.log({
          level: (entry.level as ConnectionLogPayload["level"]) || "info",
          stage: entry.stage,
          message: entry.message,
        }),
      ),
    };
  }

  private ask(prompt: ConnectionPrompt) {
    // A browser check is shown, not answered, so it doesn't stop a fallback.
    if (prompt.kind !== "browserCheck") this.prompted = true;
    this.dispatch({ type: "prompt", prompt });
  }

  private onFailed(message: string, failure?: ConnectFailure) {
    const origin = this.attempts[this.attempt]?.kind;
    const f: ConnectFailure = {
      ...(failure ?? fromRelayMessage(message)),
      origin: failure?.origin ?? origin,
    };
    const next = this.attempts[this.attempt + 1];
    if (next && !this.prompted && FALLBACK_STAGES.has(f.stage)) {
      this.log({ level: "warning", stage: "connection", message: f.message });
      this.log({
        level: "info",
        stage: "connection",
        message:
          next.kind === "relay"
            ? "Could not reach the host from this phone, trying through the server"
            : "Could not connect through the server, trying from this phone",
      });
      this.dropChannel();
      this.open(this.attempt + 1);
      return;
    }
    this.failWith(f);
  }

  private failWith(failure: ConnectFailure, fix?: Blocked["fix"]) {
    this.log({
      level: "error",
      stage: failure.stage,
      message: failure.message,
    });
    this.dropChannel();
    this.dispatch({ type: "failed", failure, fix });
  }

  private dropChannel() {
    // Bumping the run makes callbacks from the old channel no-ops.
    this.run++;
    const channel = this.channel;
    this.channel = null;
    channel?.destroy();
  }

  // Answers

  answerTotp(code: string) {
    const s = this.state;
    if (s.status !== "prompt" || s.prompt.kind !== "totp") return;
    this.channel?.sendTotpResponse(code, s.prompt.isPassword);
    this.dispatch({ type: "answered" });
  }

  answerAuth(credentials: {
    password?: string;
    sshKey?: string;
    keyPassword?: string;
  }) {
    this.channel?.sendReconnectWithCredentials(
      credentials,
      this.cols,
      this.rows,
    );
    this.dispatch({ type: "answered" });
  }

  answerHostKey(accept: boolean) {
    this.channel?.sendHostKeyResponse(accept ? "accept" : "reject");
    if (accept) {
      this.dispatch({ type: "answered" });
      return;
    }
    this.failWith({
      stage: "hostKey",
      message: "You did not trust the host key.",
      hint: "Check the key with whoever runs the host, then try again.",
      origin: originOf(this.state) ?? undefined,
    });
  }

  answerPassphrase(passphrase: string) {
    this.channel?.sendPassphraseResponse(passphrase);
    this.dispatch({ type: "answered" });
  }

  continueBrowserSignIn() {
    this.channel?.sendWarpgateContinue();
    this.dispatch({ type: "answered" });
  }

  /** The user closed a prompt. */
  cancel() {
    if (this.state.status === "failed" || this.state.status === "closed")
      return;
    this.failWith({
      stage: "cancelled",
      message: "Login cancelled.",
      hint: "Connect again when you are ready.",
      origin: originOf(this.state) ?? undefined,
    });
  }

  // Passthrough

  sendInput(data: string) {
    this.channel?.sendInput(data);
  }

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.channel?.sendResize(cols, rows);
  }

  notifyBackgrounded() {
    this.channel?.notifyBackgrounded();
  }

  notifyForegrounded() {
    this.channel?.notifyForegrounded();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dropChannel();
    this.listeners.clear();
  }
}

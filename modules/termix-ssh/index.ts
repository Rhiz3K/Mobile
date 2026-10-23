/**
 * TermixSsh - the native SSH and SFTP engine (Rust russh core).
 *
 * Every call goes to the phone's own engine, no server involved. The local
 * transport in src/core/transport builds on this. Binary data crosses the
 * bridge as base64; this file hides that and the event plumbing.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

import { fromBase64, toBase64, utf8Encode } from "./src/base64";
import type {
  NativeEvents,
  SshAlgorithms,
  SshConnectConfig,
  SshErrorKind,
  SshExecResult,
  SshFileEntry,
  SshHostKey,
  SshPrompts,
  SshTransferResult,
  TermixSshNativeModule,
} from "./src/types";

export * from "./src/types";
export { fromBase64, toBase64, utf8Decode, utf8Encode } from "./src/base64";

const Native = requireOptionalNativeModule<TermixSshNativeModule>("TermixSsh");

/** False in Expo Go, on web and in builds without the module. */
export const isSshEngineAvailable = Native != null;

const ERROR_KINDS: SshErrorKind[] = [
  "connect",
  "hostKeyRejected",
  "passphraseRequired",
  "badPassphrase",
  "invalidKey",
  "auth",
  "authCancelled",
  "channel",
  "sftp",
  "io",
  "disconnected",
];

export class SshError extends Error {
  constructor(
    readonly kind: SshErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SshError";
  }
}

/** Native errors arrive with codes like `SSH_AUTH`; turn them into SshError. */
export function toSshError(err: unknown): SshError {
  if (err instanceof SshError) return err;
  const e = err as { code?: string; message?: string } | undefined;
  const code = (e?.code ?? "").replace(/^ERR_/, "");
  const kind = code.startsWith("SSH_")
    ? ERROR_KINDS.find(
        (k) => k.toUpperCase() === code.slice(4).replace(/_/g, ""),
      )
    : undefined;
  return new SshError(kind ?? "io", e?.message ?? String(err));
}

function native(): TermixSshNativeModule {
  if (!Native) {
    throw new SshError(
      "unavailable",
      "The SSH engine is not in this build of the app.",
    );
  }
  return Native;
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toSshError(err);
  }
}

function on<K extends keyof NativeEvents>(
  event: K,
  listener: (payload: NativeEvents[K]) => void,
): { remove(): void } {
  return native().addListener(event, listener as (p: never) => void);
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function engineVersion(): string | null {
  return Native?.engineVersion() ?? null;
}

export interface ShellHandlers {
  onData(data: Uint8Array): void;
  onExit?(exitCode: number | null): void;
}

export class SshShell {
  private subs: { remove(): void }[] = [];

  constructor(
    readonly id: string,
    handlers: ShellHandlers,
  ) {
    this.subs.push(
      on("onShellData", (e) => {
        if (e.shellId === id) handlers.onData(fromBase64(e.data));
      }),
      on("onShellExit", (e) => {
        if (e.shellId !== id) return;
        this.release();
        handlers.onExit?.(e.exitCode);
      }),
    );
  }

  write(data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === "string" ? utf8Encode(data) : data;
    return call(() => native().writeShell(this.id, toBase64(bytes)));
  }

  resize(cols: number, rows: number): Promise<void> {
    return call(() => native().resizeShell(this.id, cols, rows));
  }

  async close(): Promise<void> {
    try {
      await call(() => native().closeShell(this.id));
    } finally {
      this.release();
    }
  }

  /** Stops listening without touching the channel. */
  release(): void {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }
}

export interface SshForward {
  id: string;
  /** The bound local port, useful when 0 was asked for. */
  port: number;
  close(): void;
}

export interface ShellOptions {
  term?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export class SshSession {
  private disconnectListeners = new Set<(reason: string) => void>();
  private sub: { remove(): void } | null;

  constructor(
    readonly id: string,
    readonly hostKey: SshHostKey,
    readonly algorithms: SshAlgorithms | null,
  ) {
    this.sub = on("onDisconnect", (e) => {
      if (e.sessionId !== id) return;
      this.disconnectListeners.forEach((l) => l(e.reason));
      this.release();
    });
  }

  get isClosed(): boolean {
    return native().isClosed(this.id);
  }

  onDisconnect(listener: (reason: string) => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  /** Logs in to another host through this one (a jump host hop). */
  connectVia(
    config: SshConnectConfig,
    prompts: SshPrompts,
  ): Promise<SshSession> {
    return connectSession(config, prompts, this.id);
  }

  async exec(command: string): Promise<SshExecResult> {
    const r = await call(() => native().exec(this.id, command));
    return {
      stdout: fromBase64(r.stdout),
      stderr: fromBase64(r.stderr),
      exitCode: r.exitCode,
    };
  }

  async openShell(
    options: ShellOptions,
    handlers: ShellHandlers,
  ): Promise<SshShell> {
    const shell = new SshShell(newId("shell"), handlers);
    try {
      await call(() =>
        native().openShell(
          this.id,
          shell.id,
          options.term ?? "xterm-256color",
          options.cols,
          options.rows,
          options.env ?? {},
        ),
      );
    } catch (err) {
      shell.release();
      throw err;
    }
    return shell;
  }

  list(path: string): Promise<SshFileEntry[]> {
    return call(() => native().sftpList(this.id, path));
  }

  size(path: string): Promise<number> {
    return call(() => native().sftpSize(this.id, path));
  }

  /** Streams a remote file to a local path or file:// URI. */
  download(
    remote: string,
    local: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<SshTransferResult> {
    return this.transfer(onProgress, (id) =>
      native().sftpDownload(this.id, id, remote, local),
    );
  }

  upload(
    local: string,
    remote: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<SshTransferResult> {
    return this.transfer(onProgress, (id) =>
      native().sftpUpload(this.id, id, local, remote),
    );
  }

  remove(path: string): Promise<void> {
    return call(() => native().sftpRemove(this.id, path));
  }

  forwardLocal(
    bindPort: number,
    remoteHost: string,
    remotePort: number,
    bindHost = "127.0.0.1",
  ): Promise<SshForward> {
    const id = newId("fwd");
    return call(() =>
      native().forwardLocal(
        this.id,
        id,
        bindHost,
        bindPort,
        remoteHost,
        remotePort,
      ),
    ).then((port) => forwardHandle(id, port));
  }

  /** A SOCKS5 proxy on the phone that opens every connection through SSH. */
  forwardDynamic(
    bindPort: number,
    bindHost = "127.0.0.1",
  ): Promise<SshForward> {
    const id = newId("fwd");
    return call(() =>
      native().forwardDynamic(this.id, id, bindHost, bindPort),
    ).then((port) => forwardHandle(id, port));
  }

  /** Sends a keepalive and waits for the reply, handy after coming back to the foreground. */
  ping(): Promise<void> {
    return call(() => native().ping(this.id));
  }

  async disconnect(): Promise<void> {
    try {
      await call(() => native().disconnect(this.id));
    } finally {
      this.release();
    }
  }

  private release(): void {
    this.sub?.remove();
    this.sub = null;
    this.disconnectListeners.clear();
  }

  private async transfer(
    onProgress: ((done: number, total: number) => void) | undefined,
    run: (transferId: string) => Promise<SshTransferResult>,
  ): Promise<SshTransferResult> {
    const id = newId("xfer");
    const sub = onProgress
      ? on("onTransferProgress", (e) => {
          if (e.transferId === id) onProgress(e.done, e.total);
        })
      : null;
    try {
      return await call(() => run(id));
    } finally {
      sub?.remove();
    }
  }
}

function forwardHandle(id: string, port: number): SshForward {
  return { id, port, close: () => native().closeForward(id) };
}

async function connectSession(
  config: SshConnectConfig,
  prompts: SshPrompts,
  parentSessionId: string | null,
): Promise<SshSession> {
  const n = native();
  const id = newId("ssh");
  // Prompt answers are tied to this login only.
  const subs = [
    on("onHostKey", (e) => {
      if (e.sessionId !== id) return;
      prompts.verifyHostKey(e.hostKey).then(
        (ok) => n.answerHostKey(id, ok),
        () => n.answerHostKey(id, false),
      );
    }),
    on("onKeyboardInteractive", (e) => {
      if (e.sessionId !== id) return;
      prompts.keyboardInteractive(e.request).then(
        (answers) => n.answerKeyboardInteractive(id, answers),
        () => n.answerKeyboardInteractive(id, null),
      );
    }),
    on("onBanner", (e) => {
      if (e.sessionId === id) prompts.onBanner?.(e.banner);
    }),
  ];
  try {
    const info = await call(() => n.connect(id, config, parentSessionId));
    return new SshSession(id, info.hostKey, info.algorithms);
  } finally {
    subs.forEach((s) => s.remove());
  }
}

/** Opens a TCP connection, checks the host key and logs in. */
export function connect(
  config: SshConnectConfig,
  prompts: SshPrompts,
): Promise<SshSession> {
  return connectSession(config, prompts, null);
}

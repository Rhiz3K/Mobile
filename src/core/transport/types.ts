import type { ExecOptions, SshExecResult, SshSftp } from "@/modules/termix-ssh";
import type { ConnectFailure } from "./errors";

/**
 * How the app reaches a host. "relay" goes through a linked Termix server,
 * "local" is the phone opening SSH itself. Features ask for a transport and
 * never build server URLs on their own.
 */
export type TransportKind = "relay" | "local";

/**
 * What a way of connecting can do. Features list what they need, so a host
 * whose origin can't do it shows a message instead of trying.
 * - `shell`: an interactive terminal
 * - `exec`, `sftp`: commands and files opened by the app itself
 * - `server`: the server's own routes (file manager, docker, metrics, ...)
 * - `guacd`: remote desktop through the server
 */
export type TransportCapability =
  "shell" | "exec" | "sftp" | "server" | "guacd";

export interface TerminalHostConfig {
  id: number;
  /** The server finds the host by this first; the same on every device. */
  syncId?: string | null;
  name: string;
  ip: string;
  port: number;
  username: string;
  authType: "password" | "key" | "credential" | "none" | "tailscale";
  password?: string;
  key?: string;
  keyPassword?: string;
  keyType?: string;
  credentialId?: number;
  jumpHosts?: { hostId: number }[];
  forceKeyboardInteractive?: boolean;
  overrideCredentialUsername?: boolean;
}

export type ShellState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "dataReceived"
  | "connectionFailed";

export interface HostKeyData {
  ip: string;
  port: number;
  hostname?: string;
  fingerprint: string;
  oldFingerprint?: string;
  keyType: string;
  oldKeyType?: string;
  algorithm: string;
}

/** What a shell reports back. Prompts mirror what the server asks for today. */
export interface ShellEvents {
  onStateChange: (state: ShellState, data?: Record<string, unknown>) => void;
  onData: (data: string) => void;
  onTotpRequired: (prompt: string, isPassword: boolean) => void;
  onAuthDialogNeeded: (
    reason: "no_keyboard" | "auth_failed" | "timeout",
  ) => void;
  onHostKeyVerificationRequired?: (
    scenario: "new" | "changed",
    data: HostKeyData,
  ) => void;
  onPassphraseRequired?: () => void;
  onWarpgateAuthRequired?: (url: string, securityKey: string) => void;
  onBrowserCheckRequired?: (url: string, message: string) => void;
  onBrowserCheckCompleted?: () => void;
  onPostConnectionSetup: () => void;
  onDisconnected: (hostName: string) => void;
  /** `failure` says which step failed and what to try. */
  onConnectionFailed: (message: string, failure?: ConnectFailure) => void;
  /** Fired when the backend session id is created/attached/cleared. */
  onSessionIdChange?: (sessionId: string | null) => void;
  /** Fired for each connection log line. */
  onConnectionLog?: (entry: {
    level?: string;
    stage?: string;
    message: string;
  }) => void;
}

export interface ShellOptions extends ShellEvents {
  hostConfig: TerminalHostConfig;
  /** Stable tab instance id for cross-device session tracking (open-tabs). */
  tabInstanceId?: string;
  /** Backend session id to attach to on first connect (reviving a tab). */
  initialSessionId?: string | null;
  /** Shorter connect timeout, for a try that has another way to fall back on. */
  connectTimeoutSecs?: number;
}

/** A live shell on a host. */
export interface ShellChannel {
  connect(cols: number, rows: number): Promise<void>;
  sendInput(data: string): void;
  sendResize(cols: number, rows: number): void;
  sendTotpResponse(code: string, isPassword: boolean): void;
  sendHostKeyResponse(action: "accept" | "reject"): void;
  sendPassphraseResponse(passphrase: string): void;
  sendReconnectWithCredentials(
    credentials: { password?: string; sshKey?: string; keyPassword?: string },
    cols: number,
    rows: number,
  ): void;
  sendWarpgateContinue(): void;
  notifyBackgrounded(): void;
  notifyForegrounded(): void;
  destroy(): void;
}

/** A logged in connection for commands and files, with no shell and nobody to ask. */
export interface HostSession {
  exec(command: string, options?: ExecOptions): Promise<SshExecResult>;
  sftp: SshSftp;
  close(): Promise<void>;
}

export interface Transport {
  kind: TransportKind;
  provides: TransportCapability[];
  /** False when this transport can't connect yet, with the reason in `unavailableReason`. */
  available: boolean;
  unavailableReason?: string;
  openShell(options: ShellOptions): ShellChannel;
  /**
   * Exec and SFTP on a host. Only the local transport has it; relay features
   * use the server's own routes. Needs a trusted host key and a saved login.
   */
  openSession?(
    host: TerminalHostConfig,
    options?: { signal?: AbortSignal },
  ): Promise<HostSession>;
}

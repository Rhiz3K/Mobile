/** Mirrors the fields of TerminalHostConfig that the engine needs. */
export interface SshConnectConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  /** OpenSSH, PEM, PKCS8 or PuTTY PPK text. */
  privateKey?: string;
  passphrase?: string;
  /** OpenSSH user certificate (`*-cert.pub` text) for `privateKey`. */
  certificate?: string;
  forceKeyboardInteractive?: boolean;
  allowLegacyAlgorithms?: boolean;
  connectTimeoutSecs?: number;
  keepaliveIntervalSecs?: number;
  keepaliveCountMax?: number;
}

export interface SshHostKey {
  host: string;
  port: number;
  /** Like `ssh-ed25519` or `ssh-ed25519-cert-v01@openssh.com`. */
  keyType: string;
  /** Hex of the raw key blob, the format Termix stores. */
  blobHex: string;
  /** `SHA256:...` as OpenSSH prints it. */
  sha256: string;
  isCertificate: boolean;
  caSha256: string | null;
  principals: string[];
}

export interface SshKbdRequest {
  name: string;
  instructions: string;
  prompts: { prompt: string; echo: boolean }[];
  /** 0 for the first round of this login. */
  round: number;
}

export interface SshAlgorithms {
  kex: string;
  hostKey: string;
  cipher: string;
  mac: string;
}

/** Answers the engine needs from the app while logging in. */
export interface SshPrompts {
  verifyHostKey(key: SshHostKey): Promise<boolean>;
  /** Resolve null to cancel the login. */
  keyboardInteractive(request: SshKbdRequest): Promise<string[] | null>;
  onBanner?(banner: string): void;
}

export interface SshExecResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  exitCode: number | null;
}

export interface SshFileEntry {
  name: string;
  size: number;
  isDir: boolean;
  isSymlink: boolean;
  permissions: number;
  mtime: number;
}

export interface SshTransferResult {
  bytes: number;
  millis: number;
}

export type SshErrorKind =
  | "connect"
  | "hostKeyRejected"
  | "passphraseRequired"
  | "badPassphrase"
  | "invalidKey"
  | "auth"
  | "authCancelled"
  | "channel"
  | "sftp"
  | "io"
  | "disconnected"
  | "unavailable";

/** What the native module sends and accepts. Binary data travels as base64. */
export interface NativeSessionInfo {
  hostKey: SshHostKey;
  algorithms: SshAlgorithms | null;
}

export interface TermixSshNativeModule {
  engineVersion(): string;
  connect(
    sessionId: string,
    config: SshConnectConfig,
    parentSessionId: string | null,
  ): Promise<NativeSessionInfo>;
  answerHostKey(sessionId: string, accept: boolean): void;
  answerKeyboardInteractive(sessionId: string, answers: string[] | null): void;
  isClosed(sessionId: string): boolean;
  ping(sessionId: string): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  exec(
    sessionId: string,
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }>;
  openShell(
    sessionId: string,
    shellId: string,
    term: string,
    cols: number,
    rows: number,
    env: Record<string, string>,
  ): Promise<void>;
  writeShell(shellId: string, data: string): Promise<void>;
  resizeShell(shellId: string, cols: number, rows: number): Promise<void>;
  closeShell(shellId: string): Promise<void>;
  sftpList(sessionId: string, path: string): Promise<SshFileEntry[]>;
  sftpSize(sessionId: string, path: string): Promise<number>;
  sftpDownload(
    sessionId: string,
    transferId: string,
    remote: string,
    localPath: string,
  ): Promise<SshTransferResult>;
  sftpUpload(
    sessionId: string,
    transferId: string,
    localPath: string,
    remote: string,
  ): Promise<SshTransferResult>;
  sftpRemove(sessionId: string, path: string): Promise<void>;
  forwardLocal(
    sessionId: string,
    forwardId: string,
    bindHost: string,
    bindPort: number,
    remoteHost: string,
    remotePort: number,
  ): Promise<number>;
  forwardDynamic(
    sessionId: string,
    forwardId: string,
    bindHost: string,
    bindPort: number,
  ): Promise<number>;
  closeForward(forwardId: string): void;
  addListener(
    event: string,
    listener: (payload: never) => void,
  ): { remove(): void };
}

export interface NativeEvents {
  onHostKey: { sessionId: string; hostKey: SshHostKey };
  onKeyboardInteractive: { sessionId: string; request: SshKbdRequest };
  onBanner: { sessionId: string; banner: string };
  onDisconnect: { sessionId: string; reason: string };
  onShellData: { shellId: string; data: string };
  onShellExit: { shellId: string; exitCode: number | null };
  onTransferProgress: { transferId: string; done: number; total: number };
}

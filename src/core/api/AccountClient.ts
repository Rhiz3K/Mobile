import {
  AxiosError,
  type AxiosInstance,
  type CreateAxiosDefaults,
} from "axios";
import {
  type ApiGeneration,
  buildTerminalWebSocketUrl,
  isVersionAtLeast,
  toPluginRequest,
  toWebSocketBase,
} from "@/core/api/compat/api-compat";
import {
  activePlugins,
  type ServerPlugin,
} from "@/core/api/compat/server-features";
import { handleApiError } from "@/core/api/errors";
import {
  createHttp,
  createRawHttp,
  isHtmlPayload,
  USER_AGENT,
  type HttpOwner,
} from "@/core/api/http";
import { createModules, type ApiModules } from "@/core/api/modules";
import { systemLogger } from "@/core/log/logger";
import type { AccountStorage } from "@/core/storage/kv";

export interface ProxyHeader {
  name: string;
  value: string;
}

export interface BasicAuth {
  username: string;
  password: string;
}

/** A PFX or P12 file and its passphrase, sent when the server asks for one. */
export interface ClientCert {
  pfx: string;
  passphrase: string;
  name: string | null;
}

export interface AccountClientOptions {
  accountId: string;
  serverUrl: string;
  storage: AccountStorage;
}

/** Every secret an account keeps in SecureStore. */
export const SECRET_KEYS = [
  "session",
  "customHeaders",
  "basicAuth",
  "clientCert",
];
const DATA_KEYS = ["apiGeneration", "enabledPlugins", "hostOrigins"];

/**
 * Everything needed to talk to one Termix server as one user: base URLs,
 * session token, proxy headers, client certificate, which API generation the
 * server speaks and which plugins it runs. There is one per linked account.
 */
export class AccountClient implements HttpOwner {
  readonly accountId: string;
  readonly serverUrl: string;
  readonly storage: AccountStorage;

  apiGeneration: ApiGeneration = "legacy";
  enabledPlugins: ServerPlugin[] | null = null;

  /** Axios instances per area. Legacy servers may move some of them. */
  http!: {
    host: AxiosInstance;
    tunnel: AxiosInstance;
    files: AxiosInstance;
    stats: AxiosInstance;
    auth: AxiosInstance;
  };

  readonly api: ApiModules;

  private sessionToken: string | null = null;
  private customHeaders: ProxyHeader[] = [];
  private basic: BasicAuth | null = null;
  private cert: ClientCert | null = null;
  private loaded: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private authLostListeners = new Set<() => void>();

  constructor(options: AccountClientOptions) {
    this.accountId = options.accountId;
    this.serverUrl = options.serverUrl.replace(/\/+$/, "");
    this.storage = options.storage;
    this.buildHttp();
    this.api = createModules(this);
  }

  /** Reads the saved session and caches. Safe to call more than once. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      const { data, secrets } = this.storage;
      const [token, headers, basic, cert, generation, plugins] =
        await Promise.all([
          secrets.get("session"),
          secrets.getJson<ProxyHeader[]>("customHeaders"),
          secrets.getJson<BasicAuth>("basicAuth"),
          secrets.getJson<ClientCert>("clientCert"),
          data.get("apiGeneration"),
          data.getJson<unknown>("enabledPlugins"),
        ]);
      this.sessionToken = token;
      this.customHeaders = Array.isArray(headers) ? headers : [];
      this.basic = basic;
      this.cert = cert;
      if (generation === "plugin" || generation === "legacy") {
        this.apiGeneration = generation;
      }
      this.enabledPlugins =
        this.apiGeneration === "plugin" ? activePlugins(plugins) : null;
      this.buildHttp();
    })();
    return this.loaded;
  }

  // Session

  token(): string | null {
    return this.sessionToken;
  }

  isAuthenticated(): boolean {
    return !!this.sessionToken;
  }

  async setToken(token: string | null): Promise<void> {
    this.sessionToken = token || null;
    if (this.sessionToken) {
      await this.storage.secrets.set("session", this.sessionToken);
    } else {
      await this.storage.secrets.remove("session").catch(() => {});
    }
    this.emit();
  }

  clearToken(): Promise<void> {
    return this.setToken(null);
  }

  /** Called on a 401 from a critical endpoint. */
  onAuthLost(listener: () => void): () => void {
    this.authLostListeners.add(listener);
    return () => this.authLostListeners.delete(listener);
  }

  notifyAuthLost(): void {
    // Drop the dead token too, otherwise it keeps getting sent on every
    // request and socket connect until the next cold start.
    void this.clearToken();
    this.authLostListeners.forEach((listener) => listener());
  }

  // Proxy and TLS

  proxyHeaders(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const h of this.customHeaders) {
      if (h?.name) out[h.name] = h.value ?? "";
    }
    return out;
  }

  getProxy(): { customHeaders: ProxyHeader[]; basicAuth: BasicAuth | null } {
    return { customHeaders: [...this.customHeaders], basicAuth: this.basic };
  }

  async setProxy(next: {
    customHeaders?: ProxyHeader[];
    basicAuth?: BasicAuth | null;
  }): Promise<void> {
    if (next.customHeaders) {
      this.customHeaders = next.customHeaders.filter((h) => h.name.trim());
      await this.storage.secrets.setJson("customHeaders", this.customHeaders);
    }
    if (next.basicAuth !== undefined) {
      this.basic = next.basicAuth;
      if (next.basicAuth) {
        await this.storage.secrets.setJson("basicAuth", next.basicAuth);
      } else {
        await this.storage.secrets.remove("basicAuth").catch(() => {});
      }
    }
    this.emit();
  }

  /** Saved for when native networking can present it. Not sent yet. */
  clientCert(): ClientCert | null {
    return this.cert;
  }

  async setClientCert(cert: ClientCert | null): Promise<void> {
    this.cert = cert;
    if (cert) await this.storage.secrets.setJson("clientCert", cert);
    else await this.storage.secrets.remove("clientCert").catch(() => {});
    this.emit();
  }

  /** Removes every key this account wrote. */
  async wipe(): Promise<void> {
    this.sessionToken = null;
    await this.storage.wipe({ data: DATA_KEYS, secrets: SECRET_KEYS });
  }

  // Requests

  createHttp(baseURL: string, serviceName?: string): AxiosInstance {
    return createHttp(this, baseURL, serviceName);
  }

  /** Axios without the token, for probes and fallbacks. Keeps proxy headers. */
  rawAxios(config: CreateAxiosDefaults = {}): AxiosInstance {
    return createRawHttp(this, config);
  }

  /** fetch with the proxy headers added. */
  fetch(input: string, init: RequestInit = {}): Promise<Response> {
    return fetch(input, {
      ...init,
      headers: {
        ...this.proxyHeaders(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  }

  /** Turns a failed request into an ApiError and reacts to auth loss. */
  fail(error: unknown, operation: string): never {
    return handleApiError(
      {
        onAuthLost: () => this.notifyAuthLost(),
        refreshEnabledPlugins: () => this.refreshEnabledPlugins(),
      },
      error,
      operation,
    );
  }

  rewrite(config: { baseURL?: string; url?: string; method?: string }): void {
    if (this.apiGeneration !== "plugin") return;
    const root = this.rootBase();
    const url = config.url || "";
    const full = /^https?:\/\//i.test(url)
      ? url
      : `${config.baseURL || ""}${url}`;
    if (!full.startsWith(root)) return;
    const rel = full.slice(root.length) || "/";
    const next = toPluginRequest(config.method || "get", rel);
    if (next === rel) return;
    config.baseURL = root;
    config.url = next;
  }

  // Base URLs. A saved URL may end in /ssh from old setups.

  rootBase(): string {
    return this.serverUrl.replace(/\/ssh$/, "") || this.serverUrl;
  }

  sshBase(): string {
    return /\/ssh$/.test(this.serverUrl)
      ? this.serverUrl
      : `${this.serverUrl}/ssh`;
  }

  hostBase(): string {
    if (/\/host$/.test(this.serverUrl)) return this.serverUrl;
    return `${this.serverUrl.replace(/\/ssh$/, "")}/host`;
  }

  apiUrl(path: string): string {
    return `${this.serverUrl}${path}`;
  }

  hostBaseCandidates(): string[] {
    return [this.hostBase(), this.sshBase(), this.rootBase()].filter(
      (base, index, all) => all.indexOf(base) === index,
    );
  }

  private buildHttp(): void {
    if (this.apiGeneration === "plugin") {
      // Legacy style bases on the root; rewrite() maps the paths.
      const root = this.rootBase();
      this.http = {
        host: this.createHttp(`${root}/host`, "SSH_HOST"),
        tunnel: this.createHttp(`${root}/ssh`, "TUNNEL"),
        files: this.createHttp(`${root}/ssh/file_manager`, "FILE_MANAGER"),
        stats: this.createHttp(root, "STATS"),
        auth: this.createHttp(root, "AUTH"),
      };
      return;
    }
    this.http = {
      host: this.createHttp(this.hostBase(), "SSH_HOST"),
      tunnel: this.createHttp(this.apiUrl("/ssh"), "TUNNEL"),
      files: this.createHttp(this.apiUrl("/ssh/file_manager"), "FILE_MANAGER"),
      stats: this.createHttp(this.apiUrl(""), "STATS"),
      auth: this.createHttp(this.rootBase(), "AUTH"),
    };
  }

  // Server features

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Goes up on every change, for useSyncExternalStore. */
  version = 0;

  private emit(): void {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  isPluginApi(): boolean {
    return this.apiGeneration === "plugin";
  }

  /**
   * Whether the server can serve something that needs this plugin, and for
   * protocol plugins this protocol. Same rules as isPluginEnabled.
   */
  supports(req: {
    plugin: string;
    protocol?: string;
    pluginApiOnly?: boolean;
  }): boolean {
    if (this.apiGeneration !== "plugin") return !req.pluginApiOnly;
    if (!this.enabledPlugins) return true;
    const plugin = this.enabledPlugins.find((p) => p.id === req.plugin);
    if (!plugin) return false;
    if (req.protocol && plugin.protocols) {
      return plugin.protocols.includes(req.protocol);
    }
    return true;
  }

  /**
   * True when the plugin is on. Pre 2.9 servers have everything built in,
   * and before the list has loaded this says true, so nothing flickers off.
   */
  isPluginEnabled(pluginId: string): boolean {
    if (this.apiGeneration !== "plugin" || !this.enabledPlugins) return true;
    return this.enabledPlugins.some((p) => p.id === pluginId);
  }

  private setEnabledPlugins(next: ServerPlugin[] | null): void {
    this.enabledPlugins = next;
    this.emit();
  }

  private async setApiGeneration(generation: ApiGeneration): Promise<void> {
    const changed = generation !== this.apiGeneration;
    this.apiGeneration = generation;
    if (changed) {
      systemLogger.info(`Server API generation: ${generation}`, {
        operation: "api_generation",
      });
      this.buildHttp();
      this.emit();
    }
    await this.storage.data.set("apiGeneration", generation).catch(() => {});
  }

  /**
   * Works out whether the server is 2.9+ (plugin API) or older. The public
   * plugin manifest only exists on 2.9+, and older servers answer it with
   * their web UI's HTML.
   */
  async detectApiGeneration(): Promise<ApiGeneration> {
    const root = this.rootBase();
    // Without any answer from the server, keep the cached generation.
    let reached = false;
    try {
      const res = await this.rawAxios({ timeout: 5000 }).get(
        `${root}/plugins/public-manifest`,
      );
      reached = true;
      if (
        !isHtmlPayload(res.data) &&
        res.data &&
        typeof res.data === "object"
      ) {
        await this.setApiGeneration("plugin");
        return this.apiGeneration;
      }
    } catch (error) {
      if (error instanceof AxiosError && error.response) reached = true;
    }

    try {
      if (this.sessionToken) {
        const res = await this.rawAxios({
          timeout: 5000,
          headers: { Authorization: `Bearer ${this.sessionToken}` },
        }).get(`${root}/version?checkRemote=false`);
        if (!isHtmlPayload(res.data)) {
          const version = res.data?.localVersion ?? res.data?.version;
          await this.setApiGeneration(
            isVersionAtLeast(version, "2.9.0") ? "plugin" : "legacy",
          );
          return this.apiGeneration;
        }
      }
    } catch (error) {
      if (error instanceof AxiosError && error.response) reached = true;
    }

    if (reached) await this.setApiGeneration("legacy");
    return this.apiGeneration;
  }

  /** Loads which plugins are on. Needs a signed in user. */
  async refreshEnabledPlugins(): Promise<void> {
    if (this.apiGeneration !== "plugin") {
      this.setEnabledPlugins(null);
      return;
    }
    try {
      const res = await this.http.auth.get("/plugins");
      const list = activePlugins(
        Array.isArray(res.data) ? res.data : res.data?.plugins,
      );
      if (list) {
        this.setEnabledPlugins(list);
        await this.storage.data.setJson("enabledPlugins", list).catch(() => {});
      }
    } catch {
      // Keep whatever we had; features stay visible rather than vanishing.
    }
  }

  /**
   * Re-checks the server API and the enabled plugins. Run after sign in, since
   * the plugin list and the /version fallback both need a token.
   */
  async refreshServerApi(): Promise<void> {
    await this.load();
    await this.detectApiGeneration();
    if (this.apiGeneration === "plugin") {
      await this.refreshEnabledPlugins();
    } else {
      this.setEnabledPlugins(null);
      await this.detectLegacyBases();
    }
  }

  /** Pre 2.9 servers may serve stats and auth from the root or from /ssh. */
  private async detectLegacyBases(): Promise<void> {
    const headers = {
      "Content-Type": "application/json",
      ...(this.sessionToken
        ? { Authorization: `Bearer ${this.sessionToken}` }
        : {}),
    };
    const ok = async (base: string, path: string) => {
      try {
        await this.rawAxios({ baseURL: base, timeout: 5000, headers }).head(
          path,
        );
        return true;
      } catch {
        return false;
      }
    };
    try {
      const [statsRoot, statsSsh, authRoot, authSsh] = await Promise.all([
        ok(this.rootBase(), "/status"),
        ok(this.sshBase(), "/status"),
        ok(this.rootBase(), "/users/registration-allowed"),
        ok(this.sshBase(), "/users/registration-allowed"),
      ]);
      if (statsRoot)
        this.http.stats = this.createHttp(this.rootBase(), "STATS");
      else if (statsSsh)
        this.http.stats = this.createHttp(this.sshBase(), "STATS");
      if (authRoot) this.http.auth = this.createHttp(this.rootBase(), "AUTH");
      else if (authSsh)
        this.http.auth = this.createHttp(this.sshBase(), "AUTH");
    } catch {}
  }

  // Sockets

  /** Terminal socket URL for the detected server API. */
  terminalWebSocketUrl(token: string): string {
    return buildTerminalWebSocketUrl(this.serverUrl, token, this.apiGeneration);
  }

  /**
   * WebSocket URL for the Docker exec console. Open it with the
   * `termix.jwt.<token>` subprotocol: 2.9 only reads the token from there,
   * older servers read the `?token=` query. The console speaks JSON messages:
   * connect/input/resize/disconnect.
   */
  dockerConsoleWebSocketUrl(token: string): string {
    if (this.apiGeneration === "plugin") {
      return `${toWebSocketBase(this.serverUrl)}/plugin-ws/docker/console`;
    }
    const params = new URLSearchParams({ token });
    return `${toWebSocketBase(this.rootBase())}/docker/console/?${params.toString()}`;
  }

  remoteDesktopWebSocketUrl(
    token: string,
    width?: number,
    height?: number,
  ): string {
    const params = new URLSearchParams({ token });
    if (width) params.set("width", String(width));
    if (height) params.set("height", String(height));
    const base = toWebSocketBase(this.rootBase());
    if (this.apiGeneration === "plugin") {
      return `${base}/plugin-ws/remote-desktop/display?${params.toString()}`;
    }
    return `${base}/guacamole/websocket/?${params.toString()}`;
  }

  userAgent(): string {
    return USER_AGENT;
  }
}

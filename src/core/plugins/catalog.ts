/**
 * Every official plugin, so the app can say what it does with one even when
 * no server is linked. Plugins with app screens are matched through the
 * features' `plugins` lists instead; `kind` covers the rest.
 *
 * - `app`: the app does it itself, outside any feature (host status dots).
 * - `server`: it works on the server and the app uses the result (sign in,
 *   sync, certificates for SSH logins, alerts).
 * - `look`: a layout or theme; the app has its own.
 * - `none`: not in the app yet.
 */
export type CatalogKind = "app" | "server" | "look" | "none";

export interface CatalogEntry {
  id: string;
  name: string;
  /** Only used when no app feature covers the plugin. */
  kind: CatalogKind;
}

export const OFFICIAL_PLUGINS: CatalogEntry[] = [
  { id: "acme-ssl", name: "ACME Certificates", kind: "server" },
  { id: "ai", name: "AI Assistant", kind: "none" },
  { id: "alerts", name: "Alerts", kind: "server" },
  { id: "audit-tools", name: "Audit Tools", kind: "server" },
  { id: "automations", name: "Automations", kind: "server" },
  { id: "classic-layout", name: "Classic Layout", kind: "look" },
  { id: "classic-themes", name: "Classic Themes", kind: "look" },
  { id: "cloud-providers", name: "Cloud Providers", kind: "server" },
  { id: "credential-tools", name: "Credential Tools", kind: "none" },
  { id: "databases", name: "Databases", kind: "none" },
  { id: "docker", name: "Docker", kind: "none" },
  { id: "file-manager", name: "File Manager", kind: "none" },
  { id: "fleets", name: "Fleets", kind: "none" },
  { id: "homepage", name: "Homepage", kind: "none" },
  { id: "host-metrics", name: "Host Metrics", kind: "none" },
  { id: "host-status", name: "Host Status", kind: "app" },
  { id: "hosts-config", name: "Hosts Config", kind: "server" },
  { id: "import-export", name: "Import and Export", kind: "none" },
  { id: "kubernetes", name: "Kubernetes", kind: "none" },
  { id: "ldap", name: "LDAP", kind: "server" },
  { id: "login-security", name: "Login Security", kind: "server" },
  { id: "network-topology", name: "Network Topology", kind: "none" },
  { id: "opkssh", name: "OPKSSH", kind: "server" },
  { id: "proxmox", name: "Proxmox", kind: "none" },
  { id: "remote-desktop", name: "Remote Desktop", kind: "none" },
  { id: "reverse-proxy", name: "Reverse Proxy", kind: "server" },
  { id: "samba", name: "Samba Shares", kind: "none" },
  { id: "secret-sources", name: "Secret Sources", kind: "server" },
  { id: "serial", name: "Serial", kind: "none" },
  { id: "service-manager", name: "Services", kind: "none" },
  { id: "session-recording", name: "Session Recording", kind: "server" },
  { id: "session-sharing", name: "Session Sharing", kind: "none" },
  { id: "simple-layout", name: "Simple Layout", kind: "look" },
  { id: "snippets", name: "Snippets", kind: "none" },
  { id: "ssh-terminal", name: "SSH Terminal", kind: "none" },
  { id: "sso", name: "Single sign-on", kind: "server" },
  { id: "step-ca", name: "Step CA", kind: "server" },
  { id: "sync", name: "Sync", kind: "server" },
  { id: "tailscale", name: "Tailscale", kind: "none" },
  { id: "telemetry", name: "Usage Statistics", kind: "server" },
  { id: "termix-identity", name: "Termix Identity", kind: "server" },
  { id: "tmux-monitor", name: "Tmux Monitor", kind: "server" },
  { id: "totp", name: "TOTP", kind: "none" },
  { id: "tunnels", name: "Tunnels", kind: "none" },
  { id: "vault", name: "HashiCorp Vault", kind: "server" },
  { id: "wake-on-lan", name: "Wake-on-LAN", kind: "none" },
  { id: "warpgate", name: "Warpgate", kind: "server" },
  { id: "web-endpoint", name: "Web Endpoint", kind: "none" },
  { id: "webauthn", name: "Passkeys", kind: "server" },
  { id: "workspaces", name: "Workspaces", kind: "none" },
];

const BY_ID = new Map(OFFICIAL_PLUGINS.map((entry) => [entry.id, entry]));

export function catalogEntry(id: string): CatalogEntry | null {
  return BY_ID.get(id) ?? null;
}

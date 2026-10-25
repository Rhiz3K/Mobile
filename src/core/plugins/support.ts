import type { ServerPlugin } from "@/core/api/compat/server-features";
import type { FeatureRegistry } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import { OFFICIAL_PLUGINS, catalogEntry } from "./catalog";

/**
 * - `native`: the app has its own screens.
 * - `webview`: the plugin's UI from the server, in the app.
 * - `app`: the app does it itself, outside any feature.
 * - `server`: it works on the server and the app uses the result.
 * - `look`: a layout or theme, the app has its own.
 * - `none`: nothing in the app.
 */
export type SupportMode =
  "native" | "webview" | "app" | "server" | "look" | "none";

/**
 * Where the plugin is on the account's server: `none` for This device,
 * `unknown` when the server has not said (older servers have everything).
 */
export type ServerState = "on" | "off" | "missing" | "unknown" | "none";

export type SupportSection = "phone" | "server" | "absent";

export interface SupportRow {
  /** Plugin id, or the feature id for app features no plugin backs. */
  id: string;
  name: string;
  mode: SupportMode;
  /** Works with no server. */
  onDevice: boolean;
  server: ServerState;
  /** The plugin asks for an app screen this build does not have. */
  needsNewerApp?: boolean;
  note?: string;
  section: SupportSection;
  status: string;
}

export interface SupportInput {
  registry: FeatureRegistry;
  /** The account is This device. */
  local: boolean;
  /** Every plugin the server listed, on or off. Null when unknown. */
  plugins: ServerPlugin[] | null;
}

function onPhone(defs: FeatureDef[]): boolean {
  return defs.some((def) => (def.availableOn ?? ["server"]).includes("local"));
}

function serverState(input: SupportInput, id: string): ServerState {
  if (input.local) return "none";
  if (!input.plugins) return "unknown";
  const plugin = input.plugins.find((p) => p.id === id);
  if (!plugin) return "missing";
  return plugin.active ? "on" : "off";
}

/** What the plugin does in the app, in order: app features, its manifest, the catalog. */
function modeFor(
  defs: FeatureDef[],
  plugin: ServerPlugin | undefined,
  id: string,
): { mode: SupportMode; needsNewerApp?: boolean } {
  if (defs.length) return { mode: "native" };
  const mobile = plugin?.mobile;
  if (mobile?.mode === "webview") return { mode: "webview" };
  if (mobile?.mode === "native") return { mode: "none", needsNewerApp: true };
  if (mobile?.mode === "none") return { mode: "none" };
  return { mode: catalogEntry(id)?.kind ?? "none" };
}

/** A locale key needs the plugin's strings, which the app does not load yet. */
function plainNote(note: string | undefined): string | undefined {
  return note && /\s/.test(note) ? note : undefined;
}

function serverWord(state: ServerState): string | null {
  switch (state) {
    case "off":
      return "off on this server";
    case "missing":
      return "not on this server";
    default:
      return null;
  }
}

/** The plain line under a row's name. */
export function describeSupport(
  row: Pick<SupportRow, "mode" | "onDevice" | "server" | "needsNewerApp">,
): string {
  const { mode, onDevice, server } = row;
  if (row.needsNewerApp) return "Needs a newer version of the app";
  if (mode === "look") return "The app has its own look";
  if (mode === "none") {
    return server === "on"
      ? "Not in the app yet | on this server"
      : "Not in the app yet";
  }
  const reach = serverWord(server);
  if (onDevice) {
    if (server === "none") return "Works on this phone";
    if (server === "on" || server === "unknown") return "Phone and server";
    return `Phone only | ${reach}`;
  }
  if (server === "none") return "Link a server to use it";
  if (reach) return reach.charAt(0).toUpperCase() + reach.slice(1);
  return mode === "server" ? "Runs on the server" : "Through the server";
}

function sectionFor(
  row: Pick<SupportRow, "mode" | "onDevice">,
): SupportSection {
  if (row.onDevice) return "phone";
  if (row.mode === "none" || row.mode === "look") return "absent";
  return "server";
}

function finish(row: Omit<SupportRow, "section" | "status">): SupportRow {
  return { ...row, section: sectionFor(row), status: describeSupport(row) };
}

/**
 * One row per official plugin, per other plugin the server has, and per app
 * feature no plugin backs, sorted by name.
 */
export function supportRows(input: SupportInput): SupportRow[] {
  const ids = new Set(OFFICIAL_PLUGINS.map((entry) => entry.id));
  for (const plugin of input.plugins ?? []) ids.add(plugin.id);

  const rows: SupportRow[] = [];
  for (const id of ids) {
    const plugin = input.plugins?.find((p) => p.id === id);
    const defs = input.registry.forPlugin(id);
    const { mode, needsNewerApp } = modeFor(defs, plugin, id);
    const row = finish({
      id,
      name: plugin?.name ?? catalogEntry(id)?.name ?? id,
      mode,
      onDevice: mode === "app" || (mode === "native" && onPhone(defs)),
      server: serverState(input, id),
      needsNewerApp,
      note: plainNote(plugin?.mobile?.note),
    });
    // A plugin nobody runs and the app can't show is noise.
    if (!catalogEntry(id) && row.mode === "none" && row.server !== "on") {
      continue;
    }
    rows.push(row);
  }

  for (const def of input.registry.all()) {
    if (def.plugins?.length || def.requires) continue;
    const on = def.availableOn ?? ["server"];
    if (rows.some((row) => row.id === def.id)) continue;
    rows.push(
      finish({
        id: def.id,
        name: def.title,
        mode: "native",
        onDevice: on.includes("local"),
        server: input.local ? "none" : on.includes("server") ? "on" : "missing",
      }),
    );
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

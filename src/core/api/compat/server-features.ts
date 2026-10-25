import {
  parseMobileContribution,
  type MobileContribution,
} from "@/core/plugins/mobile";

export interface ServerPlugin {
  id: string;
  name?: string;
  protocols?: string[];
  version?: string;
  /** Turned on and running. */
  active: boolean;
  /** How the plugin shows in the app, from its manifest. */
  mobile?: MobileContribution;
}

/**
 * Every plugin the server lists, on or off. Reads the server's `GET /plugins`
 * entries and the app's own cached copies of them.
 */
export function parseServerPlugins(list: unknown): ServerPlugin[] | null {
  if (!Array.isArray(list)) return null;
  return list
    .filter((p: any) => p && typeof p.id === "string")
    .map((p: any) => {
      // Server entries carry contributes.protocols, cached ones a flat list.
      const raw = Array.isArray(p.contributes?.protocols)
        ? p.contributes.protocols.map((proto: any) => proto?.id)
        : p.protocols;
      const protocols = Array.isArray(raw)
        ? raw.filter((id: unknown): id is string => typeof id === "string")
        : undefined;
      const active =
        typeof p.active === "boolean"
          ? p.active
          : p.enabled !== false && (p.state ?? "active") === "active";
      const out: ServerPlugin = { id: p.id, active };
      if (typeof p.name === "string" && p.name) out.name = p.name;
      if (protocols) out.protocols = protocols;
      if (typeof p.version === "string") out.version = p.version;
      const mobile = parseMobileContribution(p.contributes?.mobile ?? p.mobile);
      if (mobile) out.mobile = mobile;
      return out;
    });
}

/** Keeps only the plugins that are turned on and running. */
export function activePlugins(list: unknown): ServerPlugin[] | null {
  return parseServerPlugins(list)?.filter((p) => p.active) ?? null;
}

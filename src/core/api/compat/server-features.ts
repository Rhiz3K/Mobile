export interface ServerPlugin {
  id: string;
  protocols?: string[];
}

/** Keeps only the plugins that are turned on and running. */
export function activePlugins(list: unknown): ServerPlugin[] | null {
  if (!Array.isArray(list)) return null;
  return list
    .filter(
      (p: any) =>
        p &&
        typeof p.id === "string" &&
        p.enabled !== false &&
        (p.state ?? "active") === "active",
    )
    .map((p: any) => {
      // Server entries carry contributes.protocols, cached ones a flat list.
      const raw = Array.isArray(p.contributes?.protocols)
        ? p.contributes.protocols.map((proto: any) => proto?.id)
        : p.protocols;
      const protocols = Array.isArray(raw)
        ? raw.filter((id: unknown): id is string => typeof id === "string")
        : undefined;
      return protocols ? { id: p.id, protocols } : { id: p.id };
    });
}

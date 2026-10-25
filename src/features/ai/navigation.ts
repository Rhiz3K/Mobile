export function aiOrigin(from: unknown): "tools" | "settings" {
  return from === "settings" ? "settings" : "tools";
}

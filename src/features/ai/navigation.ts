import type { BottomTabBarProps } from "expo-router/tabs";

export function aiOrigin(from: unknown): "tools" | "settings" {
  return from === "settings" ? "settings" : "tools";
}

/** AI keeps its originating tab highlighted in both navigation bars. */
export function focusedTabName(
  state: BottomTabBarProps["state"],
): string | undefined {
  const activeRoute = state.routes[state.index];
  return activeRoute?.name === "ai"
    ? aiOrigin((activeRoute.params as { from?: unknown } | undefined)?.from)
    : activeRoute?.name;
}

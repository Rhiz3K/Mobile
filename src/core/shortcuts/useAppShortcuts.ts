import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import {
  addAppShortcutListener,
  setAppShortcuts,
} from "@/modules/hardware-keyboard";
import { palette } from "@/screens/palette/store";
import {
  nativeShortcuts,
  shortcutSheet,
  SHORTCUT_ROUTES,
  type AppShortcutId,
} from "./index";

/** Runs an app shortcut. Returns false for ids it does not know. */
export function runShortcut(
  id: string,
  navigate: (href: string) => void,
): boolean {
  if (id === "palette") palette.open();
  else if (id === "shortcuts") shortcutSheet.open();
  else {
    const href = SHORTCUT_ROUTES[id as AppShortcutId];
    if (!href) return false;
    navigate(href);
  }
  return true;
}

/** Hooks the hardware keyboard shortcuts up to the app. Mount once at the root. */
export function useAppShortcuts() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    setAppShortcuts(nativeShortcuts());
    const sub = addAppShortcutListener((id) => {
      runShortcut(id, (href) => router.navigate(href as never));
    });
    return () => sub?.remove();
  }, [router]);
}

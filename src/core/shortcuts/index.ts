import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { AppShortcutDef } from "@/modules/hardware-keyboard";
import { shortcutHelp } from "@/features/terminal/shortcuts";

export type AppShortcutId =
  | "palette"
  | "shortcuts"
  | "newHost"
  | "goHome"
  | "goHosts"
  | "goSessions"
  | "goTools"
  | "goSettings";

type Def = {
  id: AppShortcutId;
  label: string;
  section: "Go to" | "App";
  input: string;
  modifiers: AppShortcutDef["modifiers"];
  /** Shown in the shortcut sheet. */
  keys: string;
};

export const APP_SHORTCUTS: Def[] = [
  {
    id: "palette",
    label: "Search and commands",
    section: "App",
    input: "k",
    modifiers: ["cmd"],
    keys: "Cmd K",
  },
  {
    id: "newHost",
    label: "Add host",
    section: "App",
    input: "n",
    modifiers: ["cmd"],
    keys: "Cmd N",
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    section: "App",
    input: "/",
    modifiers: ["cmd"],
    keys: "Cmd /",
  },
  {
    id: "goHome",
    label: "Home",
    section: "Go to",
    input: "1",
    modifiers: ["cmd", "alt"],
    keys: "Cmd Opt 1",
  },
  {
    id: "goHosts",
    label: "Hosts",
    section: "Go to",
    input: "2",
    modifiers: ["cmd", "alt"],
    keys: "Cmd Opt 2",
  },
  {
    id: "goSessions",
    label: "Sessions",
    section: "Go to",
    input: "3",
    modifiers: ["cmd", "alt"],
    keys: "Cmd Opt 3",
  },
  {
    id: "goTools",
    label: "Tools",
    section: "Go to",
    input: "4",
    modifiers: ["cmd", "alt"],
    keys: "Cmd Opt 4",
  },
  {
    id: "goSettings",
    label: "Settings",
    section: "Go to",
    input: ",",
    modifiers: ["cmd"],
    keys: "Cmd ,",
  },
];

/** The route each shortcut opens. */
export const SHORTCUT_ROUTES: Partial<Record<AppShortcutId, string>> = {
  goHome: "/(tabs)/home",
  goHosts: "/(tabs)/hosts",
  goSessions: "/(tabs)/sessions",
  goTools: "/(tabs)/tools",
  goSettings: "/(tabs)/settings",
  newHost: "/(tabs)/hosts?action=new",
};

/** What the native side registers. */
export function nativeShortcuts(): AppShortcutDef[] {
  return APP_SHORTCUTS.map((s) => ({
    id: s.id,
    input: s.input,
    modifiers: s.modifiers,
    title: s.label,
  }));
}

export type ShortcutSection = {
  title: string;
  rows: { keys: string; label: string }[];
};

/**
 * Everything the sheet lists. Only iPadOS takes app wide shortcuts for now,
 * so other platforms list the terminal ones.
 */
export function shortcutSections(os: string = Platform.OS): ShortcutSection[] {
  const sections: ShortcutSection[] = [];
  if (os === "ios") {
    for (const title of ["App", "Go to"] as const) {
      sections.push({
        title,
        rows: APP_SHORTCUTS.filter((s) => s.section === title).map((s) => ({
          keys: s.keys,
          label: s.label,
        })),
      });
    }
  }
  sections.push({ title: "Terminal", rows: shortcutHelp(os) });
  return sections;
}

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

export const shortcutSheet = {
  open: () => set(true),
  close: () => set(false),
  isOpen: () => open,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useShortcutSheetOpen(): boolean {
  return useSyncExternalStore(
    shortcutSheet.subscribe,
    shortcutSheet.isOpen,
    shortcutSheet.isOpen,
  );
}

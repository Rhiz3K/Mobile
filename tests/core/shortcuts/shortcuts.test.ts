import {
  APP_SHORTCUTS,
  nativeShortcuts,
  shortcutSections,
  SHORTCUT_ROUTES,
  shortcutSheet,
} from "@/core/shortcuts";
import { runShortcut } from "@/core/shortcuts/useAppShortcuts";
import { palette } from "@/screens/palette/store";

jest.mock("expo-router", () => ({ useRouter: () => ({}) }));

test("no two shortcuts share a key", () => {
  const seen = APP_SHORTCUTS.map(
    (s) => `${[...s.modifiers].sort().join("+")}+${s.input}`,
  );
  expect(new Set(seen).size).toBe(seen.length);
});

test("app shortcuts avoid the keys the terminal already uses", () => {
  const taken = ["t", "w", "f", "v", "0", "-", "=", "."];
  for (const s of APP_SHORTCUTS) {
    if (s.modifiers.length === 1 && s.modifiers[0] === "cmd") {
      expect(taken).not.toContain(s.input);
    }
  }
});

test("the native list carries every shortcut with a title", () => {
  const native = nativeShortcuts();
  expect(native).toHaveLength(APP_SHORTCUTS.length);
  expect(native.every((n) => n.title.length > 0)).toBe(true);
});

test("iOS lists app and terminal shortcuts, others only the terminal", () => {
  expect(shortcutSections("ios").map((s) => s.title)).toEqual([
    "App",
    "Go to",
    "Terminal",
  ]);
  expect(shortcutSections("android").map((s) => s.title)).toEqual(["Terminal"]);
});

test("running a shortcut opens the palette, the sheet or a route", () => {
  const go = jest.fn();
  expect(runShortcut("palette", go)).toBe(true);
  expect(palette.isOpen()).toBe(true);
  palette.close();
  expect(runShortcut("shortcuts", go)).toBe(true);
  expect(shortcutSheet.isOpen()).toBe(true);
  shortcutSheet.close();
  expect(runShortcut("goHosts", go)).toBe(true);
  expect(go).toHaveBeenCalledWith(SHORTCUT_ROUTES.goHosts);
  expect(runShortcut("nope", go)).toBe(false);
});

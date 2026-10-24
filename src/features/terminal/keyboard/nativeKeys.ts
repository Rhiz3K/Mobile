import type { TerminalKeyTarget } from "@/core/features/types";
import type { KeyConfig } from "@/types/keyboard";

// Key row ids that are real keys, by the name the native terminal encodes.
const NAMED: Record<string, string> = {
  escape: "Escape",
  tab: "Tab",
  complete: "Tab",
  comp: "Tab",
  enter: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  arrowUp: "ArrowUp",
  history: "ArrowUp",
  hist: "ArrowUp",
  arrowDown: "ArrowDown",
  arrowLeft: "ArrowLeft",
  arrowRight: "ArrowRight",
  home: "Home",
  end: "End",
  pageUp: "PageUp",
  pageDown: "PageDown",
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, `F${i + 1}`]),
  ),
};

export function keyNameFor(id: string): string | null {
  return NAMED[id] ?? null;
}

/**
 * Sends a key row key through the native terminal, so its sticky Ctrl and Alt and the program's
 * key modes apply. Returns false for keys it can't send that way (control codes like Ctrl+C keys).
 */
export function sendNativeKey(
  target: TerminalKeyTarget,
  key: Pick<KeyConfig, "id" | "value">,
  shift: boolean,
): boolean {
  if (key.id === "shiftTab") {
    target.sendKey("Tab", true);
    return true;
  }
  const name = keyNameFor(key.id);
  if (name) {
    target.sendKey(name, shift);
    return true;
  }
  const value = shift ? key.value.toUpperCase() : key.value;
  if ([...value].length === 1 && value >= " " && value !== "\x7f") {
    target.typeText(value);
    return true;
  }
  return false;
}

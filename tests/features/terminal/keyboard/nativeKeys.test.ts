import type { TerminalKeyTarget } from "@/core/features/types";
import {
  keyNameFor,
  sendNativeKey,
} from "@/features/terminal/keyboard/nativeKeys";

function target() {
  return {
    focus: jest.fn(),
    blur: jest.fn(),
    sendKey: jest.fn(),
    typeText: jest.fn(),
    paste: jest.fn(),
    toggleModifier: jest.fn(),
    modifiers: () => ({ ctrl: "inactive", alt: "inactive" }) as const,
    subscribeModifiers: () => () => {},
  } satisfies TerminalKeyTarget;
}

test("key row ids map to the keys the terminal encodes", () => {
  expect(keyNameFor("escape")).toBe("Escape");
  expect(keyNameFor("hist")).toBe("ArrowUp");
  expect(keyNameFor("comp")).toBe("Tab");
  expect(keyNameFor("f12")).toBe("F12");
  expect(keyNameFor("pipe")).toBeNull();
});

test("named keys carry shift", () => {
  const t = target();
  expect(sendNativeKey(t, { id: "arrowLeft", value: "" }, true)).toBe(true);
  expect(t.sendKey).toHaveBeenCalledWith("ArrowLeft", true);
  sendNativeKey(t, { id: "shiftTab", value: "" }, false);
  expect(t.sendKey).toHaveBeenLastCalledWith("Tab", true);
});

test("symbols are typed so a sticky Ctrl or Alt applies", () => {
  const t = target();
  expect(sendNativeKey(t, { id: "pipe", value: "|" }, false)).toBe(true);
  expect(t.typeText).toHaveBeenCalledWith("|");
  sendNativeKey(t, { id: "num1", value: "a" }, true);
  expect(t.typeText).toHaveBeenLastCalledWith("A");
});

test("control code keys are left to the raw input path", () => {
  const t = target();
  expect(sendNativeKey(t, { id: "ctrlC", value: "\x03" }, false)).toBe(false);
  expect(sendNativeKey(t, { id: "clear", value: "clear\r" }, false)).toBe(
    false,
  );
  expect(t.typeText).not.toHaveBeenCalled();
  expect(t.sendKey).not.toHaveBeenCalled();
});

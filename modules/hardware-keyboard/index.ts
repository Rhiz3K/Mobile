import { requireOptionalNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";

interface KeyCommandEvent {
  input: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

interface HardwareKeyboardModule {
  addListener(
    eventName: "onKeyCommand",
    listener: (event: KeyCommandEvent) => void,
  ): EventSubscription;
  setEnabled?(enabled: boolean): void;
}

const HardwareKeyboard =
  requireOptionalNativeModule<HardwareKeyboardModule>("HardwareKeyboard");

export function addKeyCommandListener(
  listener: (event: KeyCommandEvent) => void,
): EventSubscription | null {
  if (!HardwareKeyboard) return null;
  return HardwareKeyboard.addListener("onKeyCommand", listener);
}

/**
 * Takes Tab, arrows and Ctrl keys from the whole app for the xterm fallback.
 * The native terminal reads the keyboard itself, so it stays off there.
 */
export function setHardwareKeyboardEnabled(enabled: boolean): void {
  HardwareKeyboard?.setEnabled?.(enabled);
}

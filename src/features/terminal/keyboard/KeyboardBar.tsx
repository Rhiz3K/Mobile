import React, { useState, useEffect, useReducer } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Text,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { TerminalHandle } from "@/features/terminal/Terminal";
import KeyboardKey from "./KeyboardKey";
import { useKeyboardCustomization } from "@/contexts/KeyboardCustomizationContext";
import { KeyConfig } from "@/types/keyboard";
import { useOrientation } from "@/utils/orientation";
import { isRepeatingKey } from "@/constants/keyboard-repeat-config";
import { useUiColors } from "@/contexts/ThemeContext";
import { sendNativeKey } from "./nativeKeys";

interface KeyboardBarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  onModifierChange?: (modifiers: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
  }) => void;
  isKeyboardIntentionallyHidden?: boolean;
  bottomInset?: number;
  onOpenSnippets?: () => void;
}

export default function KeyboardBar({
  terminalRef,
  isVisible,
  onModifierChange,
  isKeyboardIntentionallyHidden = false,
  bottomInset = 0,
  onOpenSnippets,
}: KeyboardBarProps) {
  const ui = useUiColors();
  const { config } = useKeyboardCustomization();
  const { isLandscape } = useOrientation();
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [altPressed, setAltPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  // A native terminal keeps sticky Ctrl and Alt itself; the bar shows its state.
  const keyTarget = terminalRef.current?.keyTarget?.() ?? null;
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => keyTarget?.subscribeModifiers(refresh), [keyTarget]);
  const nativeMods = keyTarget?.modifiers();

  const sendKey = (key: string) => {
    terminalRef.current?.sendInput(key);
  };

  const sendSpecialKey = (keyConfig: KeyConfig) => {
    const { value, id } = keyConfig;
    if (id === "paste") {
      handlePaste();
      return;
    }
    if (keyTarget && sendNativeKey(keyTarget, keyConfig, shiftPressed)) return;

    switch (id) {
      case "escape":
        sendKey("\x1b");
        break;
      case "tab":
      case "complete":
      case "comp":
        sendKey(shiftPressed ? "\x1b[Z" : "\t");
        break;
      case "shiftTab":
        sendKey("\x1b[Z");
        break;
      case "arrowUp":
      case "history":
      case "hist":
        sendKey("\x1b[A");
        break;
      case "arrowDown":
        sendKey("\x1b[B");
        break;
      case "arrowRight":
        sendKey("\x1b[C");
        break;
      case "arrowLeft":
        sendKey("\x1b[D");
        break;
      case "paste":
        handlePaste();
        break;
      default:
        sendKey(value);
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      if (!clipboardContent) return;
      // The native terminal brackets it and asks first when it could run commands.
      if (keyTarget) keyTarget.paste(clipboardContent);
      else sendKey(clipboardContent);
    } catch {}
  };

  const toggleModifier = (modifier: "ctrl" | "alt" | "shift") => {
    if (keyTarget && modifier !== "shift") {
      keyTarget.toggleModifier(modifier);
      return;
    }
    switch (modifier) {
      case "ctrl":
        setCtrlPressed(!ctrlPressed);
        break;
      case "alt":
        setAltPressed(!altPressed);
        break;
      case "shift":
        setShiftPressed(!shiftPressed);
        break;
    }
  };

  useEffect(() => {
    if (onModifierChange) {
      onModifierChange({
        ctrl: ctrlPressed,
        alt: altPressed,
        shift: shiftPressed,
      });
    }
  }, [ctrlPressed, altPressed, shiftPressed, onModifierChange]);

  if (!isVisible) return null;

  const renderKey = (keyConfig: KeyConfig, index: number) => {
    const isModifier =
      keyConfig.isModifier ||
      keyConfig.id === "ctrl" ||
      keyConfig.id === "alt" ||
      keyConfig.id === "shift";
    const isCtrl = keyConfig.id === "ctrl";
    const isAlt = keyConfig.id === "alt";
    const isShift = keyConfig.id === "shift";

    return (
      <KeyboardKey
        key={`${keyConfig.id}-${index}`}
        label={keyConfig.label}
        onPress={() => {
          if (isModifier) {
            if (isCtrl) toggleModifier("ctrl");
            else if (isAlt) toggleModifier("alt");
            else if (isShift) toggleModifier("shift");
          } else {
            sendSpecialKey(keyConfig);
          }
        }}
        isModifier={isModifier}
        isActive={
          isCtrl
            ? nativeMods
              ? nativeMods.ctrl !== "inactive"
              : ctrlPressed
            : isAlt
              ? nativeMods
                ? nativeMods.alt !== "inactive"
                : altPressed
              : isShift
                ? shiftPressed
                : false
        }
        isLocked={
          (isCtrl && nativeMods?.ctrl === "locked") ||
          (isAlt && nativeMods?.alt === "locked")
        }
        keySize={config.settings.keySize}
        hapticFeedback={config.settings.hapticFeedback}
        keyRepeatEnabled={isRepeatingKey(keyConfig.id)}
        keyRepeatInterval={config.settings.keyRepeatInterval}
        keyRepeatInitialDelay={config.settings.keyRepeatInitialDelay}
      />
    );
  };

  const { pinnedKeys, keys } = config.topBar;
  const hasPinnedKeys = pinnedKeys.length > 0;
  const hasPasteKey = [...pinnedKeys, ...keys].some(
    (key) => key.id === "paste",
  );

  return (
    <View
      style={{
        backgroundColor: ui.background,
        paddingBottom: isKeyboardIntentionallyHidden ? bottomInset : 0,
        marginTop: 2,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: ui.border,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingVertical: isLandscape ? 6 : 8,
          alignItems: "center",
          gap: isLandscape ? 4 : 6,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {hasPinnedKeys && (
          <>
            {pinnedKeys.map((key, index) => renderKey(key, index))}
            <View
              className="mx-2 h-[30px] w-px"
              style={{ backgroundColor: ui.border }}
            />
          </>
        )}

        {keys.map((key, index) => renderKey(key, index))}

        {!hasPasteKey && (
          <>
            <View
              style={{
                width: StyleSheet.hairlineWidth,
                height: 30,
                backgroundColor: ui.border,
                marginHorizontal: 8,
              }}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Paste clipboard into terminal"
              onPress={handlePaste}
              style={{
                height: 32,
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: ui.border,
                backgroundColor: ui.card,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: ui.brand,
                  letterSpacing: 0.5,
                }}
              >
                PASTE
              </Text>
            </TouchableOpacity>
          </>
        )}

        {onOpenSnippets && (
          <>
            <View
              style={{
                width: StyleSheet.hairlineWidth,
                height: 30,
                backgroundColor: ui.border,
                marginHorizontal: 8,
              }}
            />
            <TouchableOpacity
              onPress={onOpenSnippets}
              style={{
                height: 32,
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: ui.border,
                backgroundColor: ui.card,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: ui.brand,
                  letterSpacing: 0.5,
                }}
              >
                {"{ }"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

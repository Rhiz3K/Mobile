import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TerminalHandle } from "@/features/terminal/Terminal";
import CustomKeyboard from "./CustomKeyboard";
import { useKeyboardTabs } from "@/core/features";
import { useUiColors } from "@/contexts/ThemeContext";
import type { SSHHost } from "@/types";

// "keyboard" is built in; the rest are tabs features add.
type ToolbarMode = string;

interface BottomToolbarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  keyboardHeight: number;
  isKeyboardIntentionallyHidden?: boolean;
  initialTab?: ToolbarMode;
  hostId?: number;
  host?: SSHHost;
}

export default function BottomToolbar({
  terminalRef,
  isVisible,
  keyboardHeight,
  isKeyboardIntentionallyHidden = false,
  initialTab = "keyboard",
  hostId,
  host,
}: BottomToolbarProps) {
  const ui = useUiColors();
  const [mode, setMode] = useState<ToolbarMode>(initialTab);
  const insets = useSafeAreaInsets();
  const extraTabs = useKeyboardTabs();

  useEffect(() => {
    setMode(initialTab);
  }, [initialTab]);

  if (!isVisible) return null;

  const safeKeyboardHeight = Math.max(200, Math.min(keyboardHeight, 500));

  const tabs: { id: ToolbarMode; label: string }[] = [
    { id: "keyboard", label: "KEYBOARD" },
    ...extraTabs.map((t) => ({ id: t.id, label: t.label })),
  ];
  const ExtraTab = extraTabs.find((t) => t.id === mode)?.component;
  const activeMode = tabs.some((tab) => tab.id === mode) ? mode : "keyboard";

  const TAB_BAR_HEIGHT = 36;

  return (
    <View
      style={{
        backgroundColor: ui.background,
        marginTop: 2,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: ui.border,
      }}
      pointerEvents="box-none"
    >
      <View
        style={{
          flexDirection: "row",
          height: TAB_BAR_HEIGHT,
          backgroundColor: ui.background,
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = activeMode === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 6,
                paddingHorizontal: 4,
                backgroundColor: isActive ? ui.card : ui.background,
                borderRightWidth:
                  index !== tabs.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderRightColor: ui.border,
              }}
              onPress={() => setMode(tab.id)}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 0.8,
                  textAlign: "center",
                  color: isActive ? ui.brand : ui.textFaint,
                }}
              >
                {tab.label}
              </Text>
              {isActive && (
                <View
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: StyleSheet.hairlineWidth * 2,
                    backgroundColor: ui.brand,
                  }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View
        style={{
          height: safeKeyboardHeight,
          paddingBottom: insets.bottom,
          overflow: "hidden",
          backgroundColor: ui.background,
        }}
      >
        {activeMode === "keyboard" && (
          <CustomKeyboard
            terminalRef={terminalRef}
            isVisible={true}
            keyboardHeight={safeKeyboardHeight}
            isKeyboardIntentionallyHidden={isKeyboardIntentionallyHidden}
          />
        )}

        {activeMode !== "keyboard" && ExtraTab ? (
          <ExtraTab
            terminalRef={terminalRef}
            hostId={hostId}
            host={host}
            isVisible={true}
            height={safeKeyboardHeight}
          />
        ) : null}
      </View>
    </View>
  );
}

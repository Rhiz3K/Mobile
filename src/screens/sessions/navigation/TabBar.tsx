import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  SquareTerminal,
  Activity,
  Folder,
  Network,
  Container,
  Monitor,
  Layers,
} from "lucide-react-native";
import {
  SessionType,
  TerminalSession,
} from "@/contexts/TerminalSessionsContext";
import { useRouter } from "expo-router";
import { useOrientation } from "@/utils/orientation";
import { getTabBarHeight, getButtonSize } from "@/utils/responsive";
import {
  callImeInput,
  type TerminalImeInputHandle,
} from "@/modules/terminal-ime-input";
import { useUiColors } from "@/contexts/ThemeContext";

function getSessionIcon(type: SessionType) {
  switch (type) {
    case "terminal":
      return SquareTerminal;
    case "stats":
      return Activity;
    case "filemanager":
      return Folder;
    case "tunnel":
      return Network;
    case "docker":
      return Container;
    case "remoteDesktop":
      return Monitor;
  }
}

interface TabBarProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onTabPress: (sessionId: string) => void;
  onTabClose: (sessionId: string) => void;
  onAddSession?: () => void;
  onToggleKeyboard?: () => void;
  isCustomKeyboardVisible: boolean;
  hiddenInputRef: React.RefObject<TerminalImeInputHandle | null>;
  onHideKeyboard?: () => void;
  onShowKeyboard?: () => void;
  keyboardIntentionallyHiddenRef: React.MutableRefObject<boolean>;
  activeSessionType?: SessionType;
  onShowConnections?: () => void;
  hasBackgroundSessions?: boolean;
}

export default function TabBar({
  sessions,
  activeSessionId,
  onTabPress,
  onTabClose,
  onToggleKeyboard,
  isCustomKeyboardVisible,
  hiddenInputRef,
  onHideKeyboard,
  onShowKeyboard,
  keyboardIntentionallyHiddenRef,
  activeSessionType,
  onShowConnections,
}: TabBarProps) {
  const ui = useUiColors();
  const router = useRouter();
  const { isLandscape } = useOrientation();
  const insets = useSafeAreaInsets();

  const tabBarHeight = getTabBarHeight(isLandscape);
  const buttonSize = getButtonSize(isLandscape);

  const needsBottomPadding = activeSessionType !== "terminal";

  const handleToggleSystemKeyboard = () => {
    if (keyboardIntentionallyHiddenRef.current) {
      onShowKeyboard?.();
      setTimeout(() => {
        callImeInput(hiddenInputRef, "focus");
      }, 50);
    } else {
      onHideKeyboard?.();
      // Keyboard.dismiss() only reaches RN text inputs; the native IME view
      // keeps the keyboard up until it is blurred.
      callImeInput(hiddenInputRef, "blur");
      Keyboard.dismiss();
    }
  };

  if (sessions.length === 0) {
    return null;
  }

  return (
    <View style={{ position: "relative" }}>
      <View
        style={{
          backgroundColor: ui.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: ui.border,
          borderBottomWidth: 0,
          height: tabBarHeight + (needsBottomPadding ? insets.bottom : 0),
          paddingBottom: needsBottomPadding ? insets.bottom : 0,
          justifyContent:
            activeSessionType === "terminal" ? "center" : "flex-start",
        }}
        focusable={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: tabBarHeight,
            paddingHorizontal: 8,
            marginTop: 4,
          }}
        >
          {/* Connections panel button */}
          <View
            style={{ position: "relative", marginRight: isLandscape ? 6 : 8 }}
          >
            <TouchableOpacity
              onPress={onShowConnections}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: ui.border,
                backgroundColor: ui.muted,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Layers size={isLandscape ? 16 : 18} color={ui.text} />
            </TouchableOpacity>
          </View>

          {/* Back to hosts button */}
          <TouchableOpacity
            onPress={() => router.navigate("/hosts" as any)}
            focusable={false}
            className="items-center justify-center"
            activeOpacity={0.7}
            style={{
              width: buttonSize,
              height: buttonSize,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: ui.border,
              backgroundColor: ui.muted,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
              marginRight: isLandscape ? 6 : 8,
            }}
          >
            <ArrowLeft size={isLandscape ? 18 : 20} color={ui.text} />
          </TouchableOpacity>

          <View style={{ flex: 1, justifyContent: "center" }}>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              focusable={false}
              contentContainerStyle={{
                paddingHorizontal: 0,
                gap: 6,
                alignItems: "center",
              }}
              className="flex-row"
              scrollEnabled={true}
              directionalLockEnabled={true}
              nestedScrollEnabled={false}
              alwaysBounceVertical={false}
              alwaysBounceHorizontal={false}
              bounces={false}
              bouncesZoom={false}
              scrollEventThrottle={16}
              removeClippedSubviews={false}
              overScrollMode="never"
              disableIntervalMomentum={true}
              pagingEnabled={false}
            >
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const SessionIcon = getSessionIcon(session.type);
                const iconColor = isActive ? ui.brand : ui.textMuted;

                return (
                  <TouchableOpacity
                    key={session.id}
                    onPress={() => onTabPress(session.id)}
                    focusable={false}
                    className="flex-row items-center"
                    style={{
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: isActive ? ui.brand : ui.border,
                      backgroundColor: ui.card,
                      shadowColor: isActive ? ui.brand : "transparent",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isActive ? 0.2 : 0,
                      shadowRadius: 4,
                      elevation: isActive ? 3 : 0,
                      minWidth: isLandscape ? 90 : 110,
                      height: buttonSize,
                    }}
                  >
                    <View
                      className="flex-1 flex-row items-center gap-1.5 px-2"
                      style={{ height: buttonSize }}
                    >
                      <SessionIcon
                        size={isLandscape ? 12 : 13}
                        color={iconColor}
                        strokeWidth={2}
                      />
                      <Text
                        className="flex-1 text-sm font-medium"
                        style={{ color: iconColor }}
                        numberOfLines={1}
                      >
                        {session.title}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        onTabClose(session.id);
                      }}
                      focusable={false}
                      className="items-center justify-center"
                      activeOpacity={0.7}
                      style={{
                        width: isLandscape ? 28 : 32,
                        height: buttonSize,
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: isActive ? ui.brand : ui.border,
                      }}
                    >
                      <X
                        size={isLandscape ? 13 : 14}
                        color={isActive ? ui.text : ui.textFaint}
                        strokeWidth={2.5}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {activeSessionType === "terminal" && !isCustomKeyboardVisible && (
            <TouchableOpacity
              onPress={handleToggleSystemKeyboard}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: ui.border,
                backgroundColor: ui.muted,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
                marginLeft: isLandscape ? 6 : 8,
              }}
            >
              {keyboardIntentionallyHiddenRef.current ? (
                <ChevronUp size={isLandscape ? 18 : 20} color={ui.text} />
              ) : (
                <ChevronDown size={isLandscape ? 18 : 20} color={ui.text} />
              )}
            </TouchableOpacity>
          )}

          {activeSessionType === "terminal" && (
            <TouchableOpacity
              onPress={() => onToggleKeyboard?.()}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isCustomKeyboardVisible ? ui.brand : ui.border,
                backgroundColor: isCustomKeyboardVisible
                  ? `${ui.brand}18`
                  : ui.muted,
                elevation: 2,
                marginLeft: isLandscape ? 6 : 8,
              }}
            >
              {isCustomKeyboardVisible ? (
                <Minus size={isLandscape ? 18 : 20} color={ui.brand} />
              ) : (
                <Plus size={isLandscape ? 18 : 20} color={ui.text} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

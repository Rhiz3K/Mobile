import { Fragment, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronsUpDown } from "lucide-react-native";
import { Sheet, SheetRow, Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { useOrientation } from "@/utils/orientation";
import type { TerminalInputHandle } from "@/core/features/types";
import type { SSHHost } from "@/types";
import { useKeyPrefs } from "./KeyPrefsContext";
import { KeyView } from "./KeyView";
import { useKeyLayout } from "./useKeyLayout";
import { useKeyPad } from "./useKeyPad";

/**
 * The key row above the keyboard. Shows one row of the layout at a time;
 * the button on the left goes to the next row, long press picks one.
 */
export default function KeyRowBar({
  terminalRef,
  host,
  isVisible,
  isKeyboardIntentionallyHidden = false,
  bottomInset = 0,
  onCommand,
}: {
  terminalRef: React.RefObject<TerminalInputHandle | null>;
  host?: SSHHost | null;
  isVisible: boolean;
  isKeyboardIntentionallyHidden?: boolean;
  bottomInset?: number;
  onCommand?: (id: string) => void;
}) {
  const ui = useUiColors();
  const { isLandscape } = useOrientation();
  const { settings } = useKeyPrefs();
  const { layout } = useKeyLayout(host);
  const [rowIndex, setRowIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const pad = useKeyPad(terminalRef, {
    tmuxPrefix: layout.tmuxPrefix,
    backspaceMode: host?.terminalConfig?.backspaceMode,
    onCommand,
  });

  useEffect(() => {
    if (rowIndex >= layout.rows.length) setRowIndex(0);
  }, [layout.rows.length, rowIndex]);

  if (!isVisible || layout.rows.length === 0) return null;
  const row = layout.rows[Math.min(rowIndex, layout.rows.length - 1)];
  const multi = layout.rows.length > 1;

  return (
    <View
      style={{
        backgroundColor: ui.background,
        paddingBottom: isKeyboardIntentionallyHidden ? bottomInset : 0,
        marginTop: 2,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: ui.border,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {multi ? (
        <Pressable
          onPress={() => setRowIndex((i) => (i + 1) % layout.rows.length)}
          onLongPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Key row ${row.label}`}
          accessibilityHint="Tap for the next row, hold to pick one"
          style={{
            alignSelf: "stretch",
            minWidth: 44,
            paddingHorizontal: 6,
            alignItems: "center",
            justifyContent: "center",
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: ui.border,
          }}
        >
          <ChevronsUpDown size={12} color={ui.textMuted} />
          <Text
            className="text-[9px] uppercase text-muted-foreground"
            numberOfLines={1}
          >
            {row.label}
          </Text>
        </Pressable>
      ) : null}
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
        {row.groups.map((group, gi) => (
          <Fragment key={group.id}>
            {gi > 0 ? (
              <View
                style={{
                  width: StyleSheet.hairlineWidth,
                  height: 26,
                  backgroundColor: ui.border,
                  marginHorizontal: 4,
                }}
              />
            ) : null}
            {group.keys.map((key, ki) => (
              <KeyView
                key={`${key.id}-${ki}`}
                def={key}
                mods={pad.mods}
                settings={settings}
                onPress={pad.press}
              />
            ))}
          </Fragment>
        ))}
      </ScrollView>
      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Key rows"
      >
        {layout.rows.map((r, i) => (
          <SheetRow
            key={r.id}
            label={r.label}
            selected={i === rowIndex}
            onPress={() => {
              setRowIndex(i);
              setPicking(false);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

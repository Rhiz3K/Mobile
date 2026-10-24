import { useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { isRepeatingKey } from "@/constants/keyboard-repeat-config";
import type { StickyModifierState } from "@/core/features/types";
import KeyButton from "./KeyButton";
import type { KeySettings } from "./KeyPrefsContext";
import type { KeyDef, ModifierName } from "./model";

interface Anchor {
  x: number;
  y: number;
  width: number;
}

/**
 * One key. A modifier shows its sticky state; a key with variants opens
 * them above itself on long press.
 */
export function KeyView({
  def,
  mods,
  settings,
  onPress,
}: {
  def: KeyDef;
  mods: Record<ModifierName, StickyModifierState>;
  settings: KeySettings;
  onPress: (key: KeyDef) => void;
}) {
  const ui = useUiColors();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const modifier = def.action.type === "modifier" ? def.action.name : null;
  const state = modifier ? mods[modifier] : "inactive";
  const variants = def.variants ?? [];
  const repeats = def.action.type === "key" && isRepeatingKey(def.id);

  const openVariants = () => {
    ref.current?.measureInWindow((x, y, width) => setAnchor({ x, y, width }));
  };

  return (
    <View ref={ref} collapsable={false}>
      <KeyButton
        label={def.label}
        onPress={() => onPress(def)}
        onLongPress={variants.length && !repeats ? openVariants : undefined}
        isModifier={!!modifier}
        isActive={state !== "inactive"}
        isLocked={state === "locked"}
        keySize={settings.keySize}
        hapticFeedback={settings.hapticFeedback}
        keyRepeatEnabled={repeats}
        keyRepeatInterval={settings.keyRepeatInterval}
        keyRepeatInitialDelay={settings.keyRepeatInitialDelay}
      />
      {variants.length ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            right: 3,
            width: 3,
            height: 3,
            backgroundColor: ui.textFaint,
          }}
        />
      ) : null}
      <Modal
        visible={anchor !== null}
        transparent
        animationType="none"
        onRequestClose={() => setAnchor(null)}
        statusBarTranslucent
      >
        <Pressable style={{ flex: 1 }} onPress={() => setAnchor(null)}>
          {anchor ? (
            <View
              style={{
                position: "absolute",
                left: Math.max(4, anchor.x - 4),
                top: Math.max(4, anchor.y - 52),
                flexDirection: "row",
                borderWidth: 1,
                borderColor: ui.brand,
                backgroundColor: ui.card,
              }}
            >
              {variants.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => {
                    setAnchor(null);
                    onPress(v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={v.label}
                  style={{
                    minWidth: 44,
                    height: 44,
                    paddingHorizontal: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text className="text-sm text-foreground">{v.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

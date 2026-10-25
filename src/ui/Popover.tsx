import { Modal, Pressable, View } from "react-native";
import { useUiColors } from "@/contexts/ThemeContext";

export interface PopoverAnchor {
  /** Window coordinates, from measureInWindow. */
  x: number;
  y: number;
  width: number;
}

/**
 * A small square panel just above a control, like key variants on a long
 * press. Tapping anywhere else closes it. It sits in its own layer so a
 * scrolling row can't clip it.
 */
export function Popover({
  anchor,
  onClose,
  height = 44,
  children,
}: {
  anchor: PopoverAnchor | null;
  onClose: () => void;
  /** Height of the panel, to sit it just above the anchor. */
  height?: number;
  children: React.ReactNode;
}) {
  const ui = useUiColors();
  return (
    <Modal
      visible={anchor !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        {anchor ? (
          <View
            style={{
              position: "absolute",
              left: Math.max(4, anchor.x - 4),
              top: Math.max(4, anchor.y - height - 8),
              flexDirection: "row",
              borderWidth: 1,
              borderColor: ui.brand,
              backgroundColor: ui.card,
            }}
          >
            {children}
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

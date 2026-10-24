import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { SessionMenuContext } from "@/core/features/types";
import { KeyLayoutEditor } from "./KeyLayoutEditor";
import { useKeyLayout } from "./useKeyLayout";

/** Key rows for one host. Changing anything gives the host its own copy. */
export function HostKeyRowsView({
  ctx,
  onClose,
}: {
  ctx: SessionMenuContext;
  onClose: () => void;
}) {
  const color = useThemeColor();
  const insets = useSafeAreaInsets();
  const { layout, own, setHostLayout } = useKeyLayout(ctx.session.host);
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="min-h-12 flex-row items-center gap-3 border-b border-border px-3">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text weight="bold" className="text-title text-foreground">
            Key rows
          </Text>
          <Text className="text-meta text-muted-foreground" numberOfLines={1}>
            {own
              ? `Only for ${ctx.session.host.name}`
              : `Using the app's rows. Changes here are only for ${ctx.session.host.name}`}
          </Text>
        </View>
      </View>
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        <KeyLayoutEditor
          layout={layout}
          onChange={(next) => void setHostLayout(next).catch(() => {})}
          onReset={() => void setHostLayout(null).catch(() => {})}
          resetLabel="Use the app's rows"
        />
      </View>
    </View>
  );
}

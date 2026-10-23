import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/ui";
import { HEIGHTS } from "@/constants/tokens";

/**
 * Screen - top-level themed container with safe-area top padding and an
 * optional header (title + actions). Used by Hosts / Tools / Settings.
 */
export function Screen({
  title,
  subtitle,
  headerLeft,
  headerRight,
  children,
  scrollableHeader,
  overlay,
}: {
  title?: string;
  subtitle?: string;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** When true, the header is part of the scroll content (caller handles it). */
  scrollableHeader?: boolean;
  /** Inline views drawn over the whole screen, header included. */
  overlay?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {title && !scrollableHeader ? (
        <View
          style={{ minHeight: HEIGHTS.header }}
          className="flex-row items-center justify-between border-b border-border px-3 py-2"
        >
          {headerLeft ? (
            <View className="mr-3 shrink-0">{headerLeft}</View>
          ) : null}
          <View className="min-w-0 flex-1">
            <Text weight="bold" className="text-title text-foreground">
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-0.5 text-meta text-muted-foreground">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight ? (
            <View className="ml-3 shrink-0">{headerRight}</View>
          ) : null}
        </View>
      ) : null}
      <View className="flex-1">{children}</View>
      {overlay}
    </View>
  );
}

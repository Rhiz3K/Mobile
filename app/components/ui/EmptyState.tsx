import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/app/contexts/ThemeContext";

/** Quiet centered message for an empty list, like core's EmptyState. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const color = useThemeColor();
  return (
    <View
      className={`items-center justify-center gap-2 px-6 py-10 ${className ?? ""}`}
    >
      {Icon ? <Icon size={22} color={color("muted-foreground", 0.4)} /> : null}
      <Text className="text-center text-xs text-muted-foreground">{title}</Text>
      {hint ? (
        <Text className="text-center text-meta text-muted-foreground/70">
          {hint}
        </Text>
      ) : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}

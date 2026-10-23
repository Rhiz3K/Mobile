import { View, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Pencil, Copy, CopyPlus, Trash2 } from "lucide-react-native";
import { SSHHost } from "@/types";
import type { HostMetrics } from "@/screens/hosts/navigation/Host";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { Sheet, SheetRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import {
  useHostActions,
  type HostActionContext,
  type HostActionDef,
} from "@/core/features";

export function HostActionSheet({
  host,
  status,
  metrics,
  visible,
  onClose,
  onEdit,
  onClone,
  onDelete,
}: {
  host: SSHHost | null;
  status: "online" | "offline" | "unknown";
  metrics?: HostMetrics;
  visible: boolean;
  onClose: () => void;
  onEdit: (host: SSHHost) => void;
  onClone: (host: SSHHost) => void;
  onDelete: (host: SSHHost) => void;
}) {
  const { navigateToSessions } = useTerminalSessions();
  const { ctx, actions } = useHostActions();
  const color = useThemeColor();
  const iconColor = color("foreground") ?? "#fafafa";

  if (!host) return null;

  const actionCtx: HostActionContext = {
    ...ctx,
    openSession: (type, opts) => navigateToSessions(host, type, opts),
    close: onClose,
  };

  const runAction = (action: HostActionDef) => {
    void action.run(host, actionCtx);
    onClose();
  };

  const available = actions.filter((a) => a.isAvailable(host, ctx));
  const connectActions = available.filter((a) => a.group === "connect");
  const manageActions = available.filter((a) => a.group === "manage");

  const copyAddress = async () => {
    await Clipboard.setStringAsync(
      `${host.username ? `${host.username}@` : ""}${host.ip}`,
    );
    toast.success("Address copied");
    onClose();
  };

  const dotColor =
    status === "online"
      ? "#22c55e"
      : status === "offline"
        ? "#ef4444"
        : "#9ca3af";

  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View className="flex-row items-center gap-2.5 border-b border-border px-4 pb-3 pt-1">
        <View
          style={{ backgroundColor: dotColor }}
          className="h-2.5 w-2.5 rounded-full"
        />
        <View className="min-w-0 flex-1">
          <Text
            weight="bold"
            className="text-base text-foreground"
            numberOfLines={1}
          >
            {host.name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {host.username ? `${host.username}@` : ""}
            {host.ip}
            {host.port ? `:${host.port}` : ""}
          </Text>
        </View>
        {status === "online" &&
        metrics &&
        (metrics.cpu != null || metrics.ram != null) ? (
          <View className="shrink-0 items-end">
            {metrics.cpu != null ? (
              <Text className="text-[10px] text-muted-foreground">
                CPU {Math.round(metrics.cpu)}%
              </Text>
            ) : null}
            {metrics.ram != null ? (
              <Text className="text-[10px] text-muted-foreground">
                RAM {Math.round(metrics.ram)}%
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScrollView style={{ maxHeight: 440 }}>
        {/* Connection actions (SSH features + protocols) */}
        {[...connectActions, ...manageActions].map((action) => {
          const Icon = action.icon;
          return (
            <SheetRow
              key={action.id}
              icon={<Icon size={18} color={iconColor} />}
              label={action.label}
              onPress={() => runAction(action)}
            />
          );
        })}
        <SheetRow
          icon={<Pencil size={18} color={iconColor} />}
          label="Edit Host"
          onPress={() => {
            onEdit(host);
            onClose();
          }}
        />
        <SheetRow
          icon={<Copy size={18} color={iconColor} />}
          label="Copy Address"
          onPress={copyAddress}
        />
        <SheetRow
          icon={<CopyPlus size={18} color={iconColor} />}
          label="Clone Host"
          onPress={() => {
            onClone(host);
            onClose();
          }}
        />
        <SheetRow
          icon={<Trash2 size={18} color={color("destructive")} />}
          label="Delete Host"
          destructive
          onPress={() => {
            onDelete(host);
            onClose();
          }}
        />
      </ScrollView>
    </Sheet>
  );
}

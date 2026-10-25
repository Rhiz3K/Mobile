import { useCallback } from "react";
import { Pressable, View, type RefreshControlProps } from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { ChevronRight, Folder as FolderIcon } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { SSHHost } from "@/types";
import { Text } from "@/ui";
import Host, { type HostMetrics } from "./Host";
import {
  folderCounts,
  reorderInFolder,
  type GetHostStatus,
  type HostListRow,
} from "./hostTree";

function FolderRow({
  row,
  striped,
  getHostStatus,
  onToggle,
}: {
  row: Extract<HostListRow, { kind: "folder" }>;
  striped: boolean;
  getHostStatus: GetHostStatus;
  onToggle: (path: string) => void;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground") ?? "#9ca3af";
  const accent = color("accent-brand") ?? "#f59145";
  const { node, open } = row;
  const { total, online } = folderCounts(node, getHostStatus);
  return (
    <Pressable
      onPress={() => onToggle(node.path)}
      accessibilityRole="button"
      accessibilityLabel={`Folder ${node.name}, ${total} hosts`}
      accessibilityState={{ expanded: open }}
      style={{ marginLeft: row.depth * 14 }}
      className={`flex-row items-center gap-2 px-2 py-2 hover:bg-muted/30 active:bg-muted/40 ${
        striped ? "bg-muted/20" : ""
      }`}
    >
      <View
        style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
        className="shrink-0"
      >
        <ChevronRight size={13} color={color("muted-foreground", 0.6)} />
      </View>
      <FolderIcon
        size={14}
        color={node.color ?? (open ? accent : muted)}
        fill={node.color ? node.color : "transparent"}
      />
      <Text
        weight="bold"
        className="flex-1 text-[13px] text-foreground/80"
        numberOfLines={1}
      >
        {node.name}
      </Text>
      <Text className="text-[10px]">
        {online > 0 ? (
          <Text className="text-[10px] text-accent-brand" weight="bold">
            {online}
          </Text>
        ) : null}
        <Text className="text-[10px] text-muted-foreground/40">/{total}</Text>
      </Text>
    </Pressable>
  );
}

/**
 * The host tree as one list. Folders open and close in place; in reorder
 * mode the grip drags a host inside its folder.
 */
export function HostList({
  rows,
  getHostStatus,
  getHostMetrics,
  onToggleFolder,
  onHostPress,
  onHostLongPress,
  selecting,
  selected,
  reorder,
  onReorder,
  onRefusedDrop,
  refreshControl,
  header,
  empty,
}: {
  rows: HostListRow[];
  getHostStatus: GetHostStatus;
  getHostMetrics: (id: number) => HostMetrics | undefined;
  onToggleFolder: (path: string) => void;
  onHostPress: (host: SSHHost) => void;
  onHostLongPress: (host: SSHHost) => void;
  selecting: boolean;
  selected: Set<number>;
  reorder: boolean;
  onReorder: (positions: { id: number; sortOrder: number }[]) => void;
  onRefusedDrop: () => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  header?: React.ReactElement;
  empty?: React.ReactElement;
}) {
  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<HostListRow>) => {
      const striped = (getIndex() ?? 0) % 2 === 1;
      if (item.kind === "folder") {
        return (
          <FolderRow
            row={item}
            striped={striped}
            getHostStatus={getHostStatus}
            onToggle={onToggleFolder}
          />
        );
      }
      return (
        <Host
          host={item.host}
          depth={item.depth}
          status={getHostStatus(item.host.id)}
          metrics={getHostMetrics(item.host.id)}
          striped={striped}
          onPress={onHostPress}
          onLongPress={selecting || reorder ? undefined : onHostLongPress}
          selecting={selecting}
          selected={selected.has(item.host.id)}
          onDrag={reorder ? drag : undefined}
          dragging={isActive}
        />
      );
    },
    [
      getHostMetrics,
      getHostStatus,
      onHostLongPress,
      onHostPress,
      onToggleFolder,
      reorder,
      selected,
      selecting,
    ],
  );

  return (
    <DraggableFlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      containerStyle={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 96 }}
      showsVerticalScrollIndicator={false}
      refreshControl={reorder ? undefined : refreshControl}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      activationDistance={reorder ? 0 : 20}
      onDragEnd={({ data, from, to }) => {
        if (from === to) return;
        const positions = reorderInFolder(rows, data, rows[from].key);
        if (positions) onReorder(positions);
        else onRefusedDrop();
      }}
    />
  );
}

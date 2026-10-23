import { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { TerminalHandle } from "@/features/terminal/Terminal";
import {
  getCommandHistory,
  deleteCommandFromHistory,
  clearCommandHistory,
} from "@/core/api/main-axios";
import { showToast } from "@/utils/toast";
import { MONO_FONT } from "@/constants/fonts";
import { useUiColors } from "@/contexts/ThemeContext";

interface HistoryBarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  hostId?: number;
  isVisible: boolean;
}

/**
 * Recent commands for the active host. Tapping one types it into the terminal
 * without running it, so it can be edited first.
 */
export default function HistoryBar({
  terminalRef,
  hostId,
  isVisible,
}: HistoryBarProps) {
  const ui = useUiColors();
  const [commands, setCommands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hostId) {
      setCommands([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setCommands(await getCommandHistory(hostId));
    setLoading(false);
  }, [hostId]);

  useEffect(() => {
    if (isVisible) load();
  }, [isVisible, load]);

  const insert = (command: string) => {
    terminalRef.current?.sendInput(command);
  };

  const remove = async (command: string) => {
    if (!hostId) return;
    setCommands((prev) => prev.filter((c) => c !== command));
    await deleteCommandFromHistory(hostId, command);
  };

  const clearAll = async () => {
    if (!hostId) return;
    setCommands([]);
    await clearCommandHistory(hostId);
    showToast.success("History cleared");
  };

  if (!isVisible) return null;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ui.background,
        }}
      >
        <ActivityIndicator size="large" color={ui.brand} />
      </View>
    );
  }

  if (commands.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ui.background,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "500",
            color: ui.textMuted,
          }}
        >
          No history yet
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: ui.textFaint,
            marginTop: 4,
            textAlign: "center",
            paddingHorizontal: 24,
          }}
        >
          Commands will appear here as you run them
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: ui.background }}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {commands.map((command, idx) => (
          <View
            key={`${command}-${idx}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: ui.card,
              marginBottom: 6,
              borderWidth: 1,
              borderColor: ui.border,
            }}
          >
            <TouchableOpacity
              style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}
              activeOpacity={0.7}
              onPress={() => insert(command)}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: ui.text,
                  fontFamily: MONO_FONT,
                }}
                numberOfLines={1}
              >
                {command}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingHorizontal: 12, paddingVertical: 10 }}
              hitSlop={6}
              onPress={() => remove(command)}
            >
              <Trash2 size={15} color={ui.textFaint} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={{
            marginTop: 6,
            paddingVertical: 10,
            alignItems: "center",
            borderWidth: 1,
            borderColor: ui.border,
          }}
          activeOpacity={0.7}
          onPress={clearAll}
        >
          <Text style={{ fontSize: 12, color: ui.textMuted }}>
            Clear history
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

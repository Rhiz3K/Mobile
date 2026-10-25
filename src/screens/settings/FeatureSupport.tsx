import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Blocks } from "lucide-react-native";
import {
  accountLabel,
  accounts as accountStore,
  useAccounts,
} from "@/core/accounts";
import {
  useSupportRows,
  type SupportRow,
  type SupportSection,
} from "@/core/plugins";
import { features } from "@/core/features";
import { framePlugin } from "@/core/plugins/webview";
import { EmptyState, ListRow, Tabs, Text } from "@/ui";
import { toast } from "@/utils/toast";
import type { ListRowTone } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";

const SECTIONS: { id: SupportSection; label: string; tone: ListRowTone }[] = [
  { id: "phone", label: "Works on this phone", tone: "brand" },
  { id: "server", label: "Needs the server", tone: "muted" },
  { id: "absent", label: "Not in the app", tone: "none" },
];

function Section({
  label,
  tone,
  rows,
  onOpen,
}: {
  label: string;
  tone: ListRowTone;
  rows: SupportRow[];
  onOpen: (row: SupportRow) => (() => void) | undefined;
}) {
  if (rows.length === 0) return null;
  return (
    <View className="mb-5">
      <Text
        weight="medium"
        className="mb-1.5 px-1 text-[11px] uppercase tracking-wider text-muted-foreground"
      >
        {label} ({rows.length})
      </Text>
      <View className="border border-border">
        {rows.map((row, index) => (
          <ListRow
            key={row.id}
            index={index}
            tone={tone}
            title={row.name}
            meta={row.note ? `${row.status} | ${row.note}` : row.status}
            onPress={onOpen(row)}
          />
        ))}
      </View>
    </View>
  );
}

/** What each plugin and feature does on this phone and through the server. */
export default function FeatureSupport() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const { accounts, active } = useAccounts();
  const [accountId, setAccountId] = useState(active.id);
  const account = accounts.find((a) => a.id === accountId) ?? active;
  const rows = useSupportRows(account.id);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const client = accountStore.client(account.id);
    if (!client) return;
    setRefreshing(true);
    try {
      await client.refreshEnabledPlugins();
    } finally {
      setRefreshing(false);
    }
  }, [account.id]);

  const local = account.kind === "local";

  // A plugin that opens in the app opens from here too.
  const openRow = (row: SupportRow) => {
    if (row.mode !== "webview" || row.server !== "on") return undefined;
    const client = accountStore.client(account.id);
    const entry = client?.serverPlugins?.find((p) => p.id === row.id);
    const plugin = entry ? framePlugin(entry, features, "phone") : null;
    if (!plugin) return undefined;
    const screen = plugin.views.find((v) => !v.host);
    return () => {
      if (!screen) {
        toast.info(`Open ${plugin.name} from a host's menu.`);
        return;
      }
      router.push({
        pathname: "/tabs/plugins/[pluginId]",
        params: { pluginId: plugin.id, view: screen.view, account: account.id },
      });
    };
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="flex-1 text-base text-foreground">
          What works where
        </Text>
      </View>

      {accounts.length > 1 ? (
        <Tabs
          fill={false}
          options={accounts.map((a) => ({ id: a.id, label: accountLabel(a) }))}
          value={account.id}
          onChange={setAccountId}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          local ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          )
        }
      >
        <Text className="mb-4 text-[11px] text-muted-foreground">
          {local
            ? "This device works with no server. Link a server to add what needs one."
            : `What runs on this phone and what goes through ${accountLabel(account)}. Pull down to check the server again.`}
        </Text>
        {rows.length === 0 ? (
          <EmptyState icon={Blocks} title="Nothing to show" />
        ) : (
          SECTIONS.map((section) => (
            <Section
              key={section.id}
              label={section.label}
              tone={section.tone}
              rows={rows.filter((row) => row.section === section.id)}
              onOpen={openRow}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

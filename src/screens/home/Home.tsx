import { useCallback, useState } from "react";
import { ScrollView, Pressable, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Pin } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useAccounts } from "@/core/accounts";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import { useDashboardCards } from "@/core/features/hooks";
import { HostActionSheet } from "@/screens/hosts/HostActionSheet";
import type { SSHHost } from "@/types";
import { Button, EmptyState, Text } from "@/ui";
import { isSshHost } from "@/utils/hosts";

/** Pinned hosts, newest name order, SSH first since only they have cards. */
export function pinnedHosts(hosts: SSHHost[]): SSHHost[] {
  return hosts
    .filter((h) => h.pin)
    .sort(
      (a, b) =>
        Number(isSshHost(b)) - Number(isSshHost(a)) ||
        (a.name || a.ip).localeCompare(b.name || b.ip),
    );
}

/** Live cards for the hosts you pinned. */
export default function Home() {
  const repos = useRepositories();
  const { active: account } = useAccounts();
  const router = useRouter();
  const color = useThemeColor();
  const [focused, setFocused] = useState(true);
  const [sheetHost, setSheetHost] = useState<SSHHost | null>(null);
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const pinned = pinnedHosts(hosts.data);

  // Cards only poll while Home is the screen in front.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const toHosts = () => router.push("/(tabs)/hosts");

  return (
    <Screen title="Home">
      {pinned.length === 0 && !hosts.loading ? (
        <EmptyState
          icon={Pin}
          title="Pin a host to see it here"
          hint="Pinned hosts show their metrics, Docker and services at a glance. Pin one from its editor."
          action={
            <Button size="sm" onPress={toHosts}>
              Go to hosts
            </Button>
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 120 }}
        >
          {pinned.map((host) => (
            <HostSection
              key={`${account.id}:${host.id}`}
              host={host}
              accountId={account.id}
              active={focused}
              onOpen={() => setSheetHost(host)}
              chevron={color("muted-foreground") ?? "#888"}
            />
          ))}
        </ScrollView>
      )}
      <HostActionSheet
        host={sheetHost}
        status="unknown"
        visible={sheetHost !== null}
        onClose={() => setSheetHost(null)}
        onEdit={toHosts}
        onClone={toHosts}
        onDelete={toHosts}
      />
    </Screen>
  );
}

function HostSection({
  host,
  accountId,
  active,
  onOpen,
  chevron,
}: {
  host: SSHHost;
  accountId: string;
  active: boolean;
  onOpen: () => void;
  chevron: string;
}) {
  const cards = useDashboardCards(host);
  const { navigateToSessions } = useTerminalSessions();
  return (
    <View className="gap-2">
      <Pressable
        onPress={onOpen}
        className="flex-row items-center gap-2 active:opacity-70"
      >
        <View className="min-w-0 flex-1">
          <Text
            weight="bold"
            className="text-sm text-foreground"
            numberOfLines={1}
          >
            {host.name || host.ip}
          </Text>
          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
            {host.username ? `${host.username}@` : ""}
            {host.ip}
          </Text>
        </View>
        <ChevronRight size={16} color={chevron} />
      </Pressable>
      {cards.length === 0 ? (
        <Text className="text-[11px] text-muted-foreground">
          Turn on Docker or Services for this host, or open it to connect.
        </Text>
      ) : (
        cards.map((card) => {
          const Card = card.component;
          return (
            <Pressable
              key={card.id}
              onPress={() => void navigateToSessions(host, card.tabType)}
            >
              <Card host={host} accountId={accountId} active={active} />
            </Pressable>
          );
        })
      )}
    </View>
  );
}

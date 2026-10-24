import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useRepositories } from "@/core/data/hooks";
import { encodeHostShare } from "@/core/hosts/transfer/share";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import { Button, EmptyState, Text } from "@/ui";
import { QrCode } from "./QrCode";

export default function HostShare() {
  const router = useRouter();
  const color = useThemeColor();
  const repos = useRepositories();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [host, setHost] = useState<SSHHost | null | undefined>(undefined);

  useEffect(() => {
    repos.hosts
      .get(Number(id))
      .then(setHost)
      .catch(() => setHost(null));
  }, [id, repos]);

  const qr = useMemo(
    () => (host ? encodeHostShare(host, { compact: true }) : ""),
    [host],
  );

  const copy = async (password: boolean) => {
    if (!host) return;
    await Clipboard.setStringAsync(encodeHostShare(host, { password }));
    toast.success(password ? "Copied with the password" : "Copied the link");
  };

  return (
    <Screen
      title="Share host"
      subtitle={host?.name || host?.ip}
      headerLeft={
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
      }
    >
      {host === null ? (
        <EmptyState title="That host no longer exists" />
      ) : host ? (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 12, alignItems: "center" }}
        >
          <QrCode value={qr} size={260} />
          <Text className="text-center text-meta text-muted-foreground">
            Scan this in Termix on another phone, under Import and export. The
            code has the address, port and user. It has no password or key.
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            <Button variant="muted" size="sm" onPress={() => void copy(false)}>
              Copy link
            </Button>
            {host.authType === "password" && host.password ? (
              <Button variant="muted" size="sm" onPress={() => void copy(true)}>
                Copy link with password
              </Button>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

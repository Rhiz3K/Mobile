import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Dimensions, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Blocks, RotateCw } from "lucide-react-native";
import { useAccounts, useClient } from "@/core/accounts";
import { features } from "@/core/features";
import type { FrameViewTarget, ShellCall } from "@/core/plugins/frame-protocol";
import { framePlugin, viewLabel } from "@/core/plugins/webview";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { PluginIcon } from "@/features/plugin-webview/PluginIcon";
import {
  PluginWebView,
  type PluginWebViewHandle,
} from "@/features/plugin-webview/PluginWebView";
import { handleShellCall } from "@/features/plugin-webview/shell";
import { EmptyState, Text } from "@/ui";

function device(): "phone" | "tablet" {
  const { width, height } = Dimensions.get("window");
  return Math.min(width, height) >= 600 ? "tablet" : "phone";
}

/** A server plugin's screen that is not about one host (Homepage, Alerts). */
export default function PluginScreen() {
  const params = useLocalSearchParams<{
    pluginId: string;
    view?: string;
    account?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const { active } = useAccounts();
  const client = useClient(params.account ?? active.id);
  const { navigateToSessions } = useTerminalSessions();
  const web = useRef<PluginWebViewHandle>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => client?.subscribe(() => setVersion((n) => n + 1)), [client]);

  const plugin = useMemo(() => {
    const entry = client?.serverPlugins?.find((p) => p.id === params.pluginId);
    return entry ? framePlugin(entry, features, device()) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, params.pluginId, version]);

  const first =
    plugin?.views.find((v) => v.view === params.view) ??
    plugin?.views.find((v) => !v.host);
  const [target, setTarget] = useState<FrameViewTarget | null>(null);
  const view = target ?? (first ? { view: first.view } : null);
  const shown = plugin?.views.find((v) => v.view === view?.view);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router]);

  useEffect(() => {
    let handling = false;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (handling) return true;
      handling = true;
      void (web.current?.goBack() ?? Promise.resolve(false)).then((handled) => {
        handling = false;
        if (!handled) close();
      });
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const onShell = useCallback(
    (call: ShellCall, args: unknown[]) => {
      if (!client || !plugin) return;
      handleShellCall(
        {
          client,
          plugin,
          navigateToSessions: (host, type) => navigateToSessions(host, type),
          showView: setTarget,
          close,
        },
        call,
        args,
      );
    },
    [client, plugin, navigateToSessions, close],
  );

  const foreground = color("foreground");
  const muted = color("muted-foreground");

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable onPress={close} hitSlop={8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={foreground} />
        </Pressable>
        <PluginIcon
          name={shown?.icon ?? plugin?.icon}
          size={18}
          color={muted}
        />
        <Text
          weight="bold"
          className="flex-1 text-base text-foreground"
          numberOfLines={1}
        >
          {plugin && shown ? viewLabel(plugin, shown) : (plugin?.name ?? "")}
        </Text>
        {plugin ? (
          <Pressable
            onPress={() => web.current?.reload()}
            hitSlop={8}
            accessibilityLabel="Reload"
          >
            <RotateCw size={18} color={muted} />
          </Pressable>
        ) : null}
      </View>
      {client && plugin && view ? (
        <PluginWebView
          ref={web}
          client={client}
          plugin={plugin}
          view={view}
          onShell={onShell}
        />
      ) : (
        <EmptyState
          className="flex-1"
          icon={Blocks}
          title="This plugin is not available"
          hint="It may be off on the server, or not made for the app."
        />
      )}
    </View>
  );
}

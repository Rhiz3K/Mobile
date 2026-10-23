import { forwardRef } from "react";
import { Activity, Server } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import {
  DEFAULT_STATS_CONFIG,
  type StatsConfig,
} from "@/constants/stats-config";
import type { SSHHost } from "@/types";
import { isSshHost } from "@/utils/hosts";
import { ServerStats, type ServerStatsHandle } from "./ServerStats";

function statsConfig(host: SSHHost): StatsConfig {
  try {
    return host.statsConfig
      ? JSON.parse(host.statsConfig)
      : DEFAULT_STATS_CONFIG;
  } catch {
    return DEFAULT_STATS_CONFIG;
  }
}

const MetricsTab = forwardRef<ServerStatsHandle, SessionTabProps>(
  ({ session, isVisible, onClose }, ref) => (
    <ServerStats
      ref={ref}
      hostConfig={{
        id: parseInt(session.host.id.toString()),
        name: session.host.name,
        statsConfig: session.host.statsConfig,
        quickActions: session.host.quickActions,
      }}
      isVisible={isVisible}
      title={session.title}
      onClose={onClose}
    />
  ),
);
MetricsTab.displayName = "MetricsTab";

export const hostMetricsFeature: FeatureDef = {
  id: "host-metrics",
  title: "Host Metrics",
  source: "native",
  requires: { plugin: "host-metrics" },
  sessionTabs: [
    {
      type: "stats",
      icon: Activity,
      titleSuffix: () => "Metrics",
      shortLabel: () => "Metrics",
      serverTabTypes: ["host-metrics", "stats"],
      // 2.9+ web names this tab after its plugin.
      toServerTabType: (_s, client) =>
        client?.isPluginApi() ? "host-metrics" : "stats",
      capabilities: ["keyboard-cover"],
      component: MetricsTab,
    },
  ],
  hostActions: [
    {
      id: "host-metrics.open",
      label: "Host Metrics",
      icon: Server,
      group: "connect",
      order: 50,
      isAvailable: (host) =>
        isSshHost(host) && statsConfig(host).metricsEnabled !== false,
      run: (_host, ctx) => ctx.openSession("stats"),
    },
  ],
};

import { forwardRef } from "react";
import { SquareTerminal, Terminal as TerminalIcon } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { isSshHost, toTerminalHostConfig } from "@/utils/hosts";
import { Terminal, type TerminalHandle } from "./Terminal";
import HistoryBar from "./keyboard/HistoryBar";

const TerminalTab = forwardRef<TerminalHandle, SessionTabProps>(
  (
    {
      session,
      isVisible,
      onClose,
      onBackendSessionId,
      onTransportResolved,
      onBackgroundColorChange,
    },
    ref,
  ) => (
    <Terminal
      ref={ref}
      host={session.host}
      hostConfig={toTerminalHostConfig(session.host)}
      type={session.type}
      origin={session.origin}
      onTransportResolved={onTransportResolved}
      isVisible={isVisible}
      title={session.title}
      tabInstanceId={session.instanceId}
      initialSessionId={session.restoredSessionId}
      onSessionIdChange={onBackendSessionId}
      onClose={onClose}
      onBackgroundColorChange={onBackgroundColorChange}
    />
  ),
);
TerminalTab.displayName = "TerminalTab";

export const terminalFeature: FeatureDef = {
  id: "terminal",
  title: "Terminal",
  source: "native",
  requires: { plugin: "ssh-terminal" },
  // This device opens SSH itself through modules/termix-ssh.
  availableOn: ["local", "server"],
  sessionTabs: [
    {
      type: "terminal",
      icon: SquareTerminal,
      titleSuffix: () => "",
      shortLabel: () => "SSH",
      needs: ["shell"],
      serverTabTypes: ["terminal"],
      toServerTabType: () => "terminal",
      capabilities: ["terminal-input"],
      component: TerminalTab,
    },
  ],
  hostActions: [
    {
      id: "terminal.open",
      label: "Terminal",
      icon: TerminalIcon,
      group: "connect",
      order: 10,
      isAvailable: (host) => isSshHost(host) && host.enableTerminal !== false,
      run: (_host, ctx) => ctx.openSession("terminal"),
    },
  ],
  hostToggles: [
    { key: "enableTerminal", label: "Terminal", group: "feature", order: 10 },
  ],
  hostBadges: [
    {
      label: "TERM",
      order: 20,
      show: (host, ssh) => ssh && !!host.enableTerminal,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "terminal",
      label: "Terminal",
      order: 10,
      matches: (host) => host.enableTerminal !== false,
    },
  ],
  keyboardTabs: [
    { id: "history", label: "HISTORY", order: 20, component: HistoryBar },
  ],
  capabilities: ["host.quickConnect"],
};

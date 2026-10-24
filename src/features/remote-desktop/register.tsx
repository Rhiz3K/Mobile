import {
  MessagesSquare,
  Monitor,
  MousePointerClick,
} from "lucide-react-native";
import { forwardRef } from "react";
import { checkOpen } from "@/core/features/open-check";
import type {
  FeatureDef,
  FeatureIcon,
  HostActionDef,
  SessionTabProps,
} from "@/core/features/types";
import { Terminal, type TerminalHandle } from "@/features/terminal/Terminal";
import KeyRowBar from "@/features/terminal/keys/KeyRowBar";
import BottomToolbar from "@/features/terminal/keyboard/BottomToolbar";
import type { SSHHost } from "@/types";
import { isSshHost, toTerminalHostConfig } from "@/utils/hosts";
import { RemoteDesktop, type RemoteDesktopProtocol } from "./RemoteDesktop";
import { REMOTE_DESKTOP_TAB, TELNET_TAB, telnetTabFor } from "./telnet";

const PLUGIN = "remote-desktop";
const PROTOCOLS: RemoteDesktopProtocol[] = ["rdp", "vnc", "telnet"];

function asProtocol(value?: string): RemoteDesktopProtocol {
  return PROTOCOLS.includes(value as RemoteDesktopProtocol)
    ? (value as RemoteDesktopProtocol)
    : "rdp";
}

function RemoteDesktopTab({
  session,
  isVisible,
  onClose,
  onStatus,
}: SessionTabProps) {
  return (
    <RemoteDesktop
      host={session.host}
      isVisible={isVisible}
      title={session.title}
      protocol={asProtocol(session.remoteProtocol)}
      onClose={onClose}
      onStatus={onStatus}
    />
  );
}

/** Telnet the phone opens itself, in the native terminal. */
const TelnetTab = forwardRef<TerminalHandle, SessionTabProps>(
  (
    {
      session,
      isVisible,
      onClose,
      onTransportResolved,
      onBackgroundColorChange,
      onTitle,
      onMenu,
      onShortcut,
      onStatus,
    },
    ref,
  ) => (
    <Terminal
      ref={ref}
      host={session.host}
      hostConfig={toTerminalHostConfig(session.host)}
      type={session.type}
      origin={session.origin}
      protocol="telnet"
      onTransportResolved={onTransportResolved}
      isVisible={isVisible}
      title={session.title}
      tabInstanceId={session.instanceId}
      onClose={onClose}
      onBackgroundColorChange={onBackgroundColorChange}
      onTitle={onTitle}
      onMenu={onMenu}
      onShortcut={onShortcut}
      restored={session.restored}
      onStatus={onStatus}
    />
  ),
);
TelnetTab.displayName = "TelnetTab";

/** The tab all three protocols open through the server. */
export const remoteDesktopFeature: FeatureDef = {
  id: "remote-desktop",
  title: "Remote Desktop",
  source: "native",
  requires: { plugin: PLUGIN },
  sessionTabs: [
    {
      type: REMOTE_DESKTOP_TAB,
      icon: Monitor,
      titleSuffix: (s) =>
        s.remoteProtocol ? s.remoteProtocol.toUpperCase() : "Remote",
      shortLabel: (s) => SHORT[asProtocol(s.remoteProtocol)],
      needs: ["guacd"],
      serverTabTypes: PROTOCOLS,
      toServerTabType: (s) => asProtocol(s.remoteProtocol),
      fromServerTabType: (tabType) => ({ remoteProtocol: tabType }),
      requires: (s) => ({
        plugin: PLUGIN,
        protocol: asProtocol(s.remoteProtocol),
      }),
      capabilities: ["own-keyboard"],
      component: RemoteDesktopTab,
    },
  ],
};

const SHORT: Record<RemoteDesktopProtocol, string> = {
  rdp: "RDP",
  vnc: "VNC",
  telnet: "Telnet",
};

function protocolFeature(
  protocol: RemoteDesktopProtocol,
  opts: {
    label: string;
    badge: string;
    description?: string;
    icon: FeatureIcon;
    order: number;
    enabled: (host: SSHHost) => boolean;
    toggleKey: string;
    run?: HostActionDef["run"];
    extra?: Partial<FeatureDef>;
  },
): FeatureDef {
  return {
    id: `remote-desktop.${protocol}`,
    title: opts.label,
    source: "native",
    requires: { plugin: PLUGIN, protocol },
    hostActions: [
      {
        id: `remote-desktop.${protocol}.open`,
        label: opts.label,
        icon: opts.icon,
        group: "connect",
        order: 60 + opts.order,
        isAvailable: opts.enabled,
        run:
          opts.run ??
          ((_host, ctx) =>
            ctx.openSession(REMOTE_DESKTOP_TAB, { remoteProtocol: protocol })),
      },
    ],
    hostToggles: [
      {
        key: opts.toggleKey,
        label: opts.label,
        description: opts.description,
        group: "protocol",
        order: 10 + opts.order,
        formTab: { id: protocol, label: opts.label, order: 20 + opts.order },
      },
    ],
    hostBadges: [
      {
        label: opts.badge,
        order: 10 + opts.order,
        show: opts.enabled,
      },
    ],
    hostFilters: [
      {
        group: "protocol",
        value: protocol,
        label: opts.label,
        order: 10 + opts.order,
        matches: opts.enabled,
      },
    ],
    ...opts.extra,
  };
}

export const rdpFeature = protocolFeature("rdp", {
  label: "RDP",
  badge: "RDP",
  description: "Remote Desktop",
  icon: Monitor,
  order: 0,
  enabled: (host) => !!host.enableRdp,
  toggleKey: "enableRdp",
});

export const vncFeature = protocolFeature("vnc", {
  label: "VNC",
  badge: "VNC",
  icon: MousePointerClick,
  order: 1,
  enabled: (host) => !!host.enableVnc,
  toggleKey: "enableVnc",
});

// The phone dials Telnet itself, so it works with no server and on servers
// without the remote desktop plugin. Through a server it uses that plugin.
export const telnetFeature = protocolFeature("telnet", {
  label: "Telnet",
  badge: "TEL",
  icon: MessagesSquare,
  order: 2,
  enabled: (host) => !!host.enableTelnet,
  toggleKey: "enableTelnet",
  run: async (host, ctx) => {
    const check = await checkOpen(
      ctx.account.id,
      host,
      isSshHost(host),
      TELNET_TAB,
    );
    const tab = telnetTabFor(check);
    await ctx.openSession(
      tab,
      tab === TELNET_TAB ? undefined : { remoteProtocol: "telnet" },
    );
  },
  extra: {
    requires: undefined,
    availableOn: ["local", "server"],
    sessionTabs: [
      {
        type: TELNET_TAB,
        icon: MessagesSquare,
        titleSuffix: () => "Telnet",
        shortLabel: () => "Telnet",
        needsOneOf: [["tcp"]],
        dialsDirectly: true,
        // Server tab records named telnet still reopen in the server's view.
        serverTabTypes: [],
        toServerTabType: () => "telnet",
        capabilities: ["terminal-input"],
        component: TelnetTab,
        inputChrome: { keyRow: KeyRowBar, keyPanel: BottomToolbar },
      },
    ],
  },
});

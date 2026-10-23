import {
  MessagesSquare,
  Monitor,
  MousePointerClick,
} from "lucide-react-native";
import type {
  FeatureDef,
  FeatureIcon,
  SessionTabProps,
} from "@/core/features/types";
import type { SSHHost } from "@/types";
import { RemoteDesktop, type RemoteDesktopProtocol } from "./RemoteDesktop";

const PLUGIN = "remote-desktop";
const PROTOCOLS: RemoteDesktopProtocol[] = ["rdp", "vnc", "telnet"];

function asProtocol(value?: string): RemoteDesktopProtocol {
  return PROTOCOLS.includes(value as RemoteDesktopProtocol)
    ? (value as RemoteDesktopProtocol)
    : "rdp";
}

function RemoteDesktopTab({ session, isVisible, onClose }: SessionTabProps) {
  return (
    <RemoteDesktop
      host={session.host}
      isVisible={isVisible}
      title={session.title}
      protocol={asProtocol(session.remoteProtocol)}
      onClose={onClose}
    />
  );
}

/** The tab all three protocols open. */
export const remoteDesktopFeature: FeatureDef = {
  id: "remote-desktop",
  title: "Remote Desktop",
  source: "native",
  requires: { plugin: PLUGIN },
  sessionTabs: [
    {
      type: "remoteDesktop",
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
        run: (_host, ctx) =>
          ctx.openSession("remoteDesktop", { remoteProtocol: protocol }),
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

export const telnetFeature = protocolFeature("telnet", {
  label: "Telnet",
  badge: "TEL",
  icon: MessagesSquare,
  order: 2,
  enabled: (host) => !!host.enableTelnet,
  toggleKey: "enableTelnet",
});

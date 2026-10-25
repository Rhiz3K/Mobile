import { useMemo } from "react";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  Blocks,
  Database,
  FileText,
  Keyboard,
  Link,
  Plus,
  RefreshCw,
  Server,
  Settings,
  SquareTerminal,
  Users,
  Zap,
} from "lucide-react-native";
import { useAppContext } from "@/contexts/AppContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useActiveAccount } from "@/core/accounts";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import {
  features,
  useCapability,
  useQuickActions,
  useSettingsLinks,
  useTools,
  type ToolDef,
} from "@/core/features";
import { useRecentHosts } from "@/core/hosts/recent";
import { sessionHandles } from "@/core/sessions/handles";
import {
  hostContext,
  inputsOf,
  resolveSnippet,
  sendToTerminal,
  snippetMode,
} from "@/features/snippets/run";
import { useOpenHost } from "@/screens/hosts/useOpenHost";
import type { Snippet } from "@/types";
import { toast } from "@/utils/toast";
import type { PaletteItem } from "./search";

export const SETTINGS_PAGES: {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: PaletteItem["icon"];
  serverOnly?: boolean;
}[] = [
  {
    id: "settings",
    label: "Settings",
    detail: "Account, appearance, security",
    href: "/(tabs)/settings",
    icon: Settings,
  },
  {
    id: "sync",
    label: "Sync and proxy",
    detail: "What syncs, conflicts, proxy",
    href: "/tabs/settings/Sync",
    icon: RefreshCw,
    serverOnly: true,
  },
  {
    id: "plugins",
    label: "Plugins",
    detail: "What works where",
    href: "/tabs/settings/Plugins",
    icon: Blocks,
  },
  {
    id: "terminal",
    label: "Terminal",
    detail: "Font, theme, cursor, scrollback",
    href: "/tabs/settings/TerminalCustomization",
    icon: SquareTerminal,
  },
  {
    id: "keyboard",
    label: "Keyboard",
    detail: "Key rows and shortcuts",
    href: "/tabs/settings/KeyboardCustomization",
    icon: Keyboard,
  },
  {
    id: "local-data",
    label: "Local data",
    detail: "Backup, restore, delete",
    href: "/tabs/settings/LocalData",
    icon: Database,
  },
];

/**
 * Everything the palette can find: hosts, snippets, actions and settings.
 * `pickHost` asks for a host for tools that run on one.
 */
export function usePaletteItems({
  close,
  pickHost,
}: {
  close: () => void;
  pickHost: (tool: ToolDef) => void;
}): PaletteItem[] {
  const router = useRouter();
  const account = useActiveAccount();
  const repos = useRepositories();
  const { openAccountSwitcher, openAuthFlow } = useAppContext();
  const { sessions, activeSessionId, navigateToSessions } =
    useTerminalSessions();
  const openHost = useOpenHost();
  const tools = useTools();
  const quick = useQuickActions();
  const links = useSettingsLinks();
  const canQuickConnect = useCapability("host.quickConnect");
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const snippets = useLiveList<Snippet>(
    repos.snippets,
    () => repos.snippets.list().catch(() => []),
    [repos],
  );
  const recent = useRecentHosts(account.id, hosts.data);

  return useMemo(() => {
    const go = (href: string) => () => {
      close();
      router.push(href as never);
    };
    const recentIds = new Set(recent.slice(0, 5).map((h) => h.id));
    const active = sessions.find((s) => s.id === activeSessionId);
    const terminal =
      active && features.sessionHas(active.type, "terminal-input")
        ? active
        : null;

    const items: PaletteItem[] = hosts.data.map((host) => ({
      id: `host:${host.id}`,
      section: "hosts",
      label: host.name || host.ip,
      detail: `${host.username ? `${host.username}@` : ""}${host.ip}`,
      keywords: [host.folder ?? "", ...(host.tags ?? [])],
      icon: Server,
      suggested: recentIds.has(host.id),
      run: () => {
        close();
        void openHost(host).then((opened) => {
          if (!opened) router.navigate("/(tabs)/hosts" as never);
        });
      },
    }));

    for (const snippet of snippets.data) {
      const asks = inputsOf(snippet).length > 0;
      items.push({
        id: `snippet:${snippet.id}`,
        section: "snippets",
        label: snippet.name,
        detail:
          terminal && !asks ? `Run in ${terminal.title}` : snippet.content,
        keywords: [snippet.content, snippet.folder ?? ""],
        icon: FileText,
        run: () => {
          close();
          const handle = terminal ? sessionHandles.get(terminal.id) : null;
          if (handle && terminal && !asks) {
            const text = resolveSnippet(snippet, hostContext(terminal.host));
            sendToTerminal(handle, text, snippetMode(snippet));
            void navigateToSessions();
            return;
          }
          void Clipboard.setStringAsync(snippet.content);
          toast.success(
            asks
              ? "Copied. Run it from the terminal's snippets to fill in its values."
              : "Copied. Open a terminal to run snippets.",
          );
        },
      });
    }

    items.push({
      id: "action:add-host",
      section: "actions",
      label: "Add host",
      icon: Plus,
      suggested: true,
      run: () => {
        close();
        router.navigate("/(tabs)/hosts?action=new" as never);
      },
    });
    if (canQuickConnect) {
      items.push({
        id: "action:quick-connect",
        section: "actions",
        label: "Quick connect",
        detail: "user@host:port",
        icon: Zap,
        suggested: true,
        run: () => {
          close();
          router.navigate("/(tabs)/hosts?action=quick" as never);
        },
      });
    }
    items.push(
      {
        id: "action:switch-account",
        section: "actions",
        label: "Switch account",
        icon: Users,
        run: () => {
          close();
          openAccountSwitcher();
        },
      },
      {
        id: "action:link-server",
        section: "actions",
        label: "Link a server",
        icon: Link,
        run: () => {
          close();
          openAuthFlow("server");
        },
      },
    );
    for (const tool of tools) {
      items.push({
        id: `tool:${tool.id}`,
        section: "actions",
        label: tool.label,
        detail: tool.description,
        icon: tool.icon,
        run: tool.tabType
          ? () => pickHost(tool)
          : go(tool.href ?? "/(tabs)/tools"),
      });
    }
    for (const action of quick.actions) {
      items.push({
        id: `quick:${action.id}`,
        section: "actions",
        label: action.label,
        detail: "From your server",
        icon: action.icon,
        run: () => {
          close();
          action.run(quick.ctx);
        },
      });
    }

    for (const page of SETTINGS_PAGES) {
      if (page.serverOnly && account.kind !== "server") continue;
      items.push({
        id: `settings:${page.id}`,
        section: "settings",
        label: page.label,
        detail: page.detail,
        icon: page.icon,
        run: go(page.href),
      });
    }
    for (const link of links) {
      items.push({
        id: `settings:${link.id}`,
        section: "settings",
        label: link.label,
        icon: link.icon,
        run: go(link.href),
      });
    }
    return items;
  }, [
    account.kind,
    activeSessionId,
    canQuickConnect,
    close,
    hosts.data,
    links,
    navigateToSessions,
    openAccountSwitcher,
    openAuthFlow,
    openHost,
    pickHost,
    quick,
    recent,
    router,
    sessions,
    snippets.data,
    tools,
  ]);
}

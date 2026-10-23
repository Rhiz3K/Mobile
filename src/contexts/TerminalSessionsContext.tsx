import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { SSHHost } from "@/types";
import { router } from "expo-router";
import { useAppContext } from "@/contexts/AppContext";
import { sessionFeature } from "@/core/api/compat/server-features";
import { toast } from "@/utils/toast";
import { accounts, clientFor, useActiveAccount } from "@/core/accounts";
import type { AccountClient } from "@/core/api/AccountClient";
import type { OpenTabRecord } from "@/core/api/types";

export type SessionType =
  "terminal" | "stats" | "filemanager" | "tunnel" | "docker" | "remoteDesktop";

export type RemoteDesktopProtocol = "rdp" | "vnc" | "telnet";

export interface TerminalSession {
  id: string;
  /** Account that opened the tab. It keeps using it after a switch. */
  accountId: string;
  host: SSHHost;
  title: string;
  isActive: boolean;
  createdAt: Date;
  type: SessionType;
  /** Stable per-tab instance id used for cross-device tab sync (open-tabs API). */
  instanceId: string;
  /** Backend SSH session id this tab is attached to, when resumed/created. */
  backendSessionId?: string | null;
  /** When set, the terminal should attach to this backend session on connect. */
  restoredSessionId?: string | null;
  /** Selected protocol for remote desktop tabs. */
  remoteProtocol?: RemoteDesktopProtocol;
}

const TYPE_LABELS: Record<Exclude<SessionType, "remoteDesktop">, string> = {
  terminal: "",
  stats: "Metrics",
  filemanager: "Files",
  tunnel: "Tunnels",
  docker: "Docker",
};

function getSessionTypeLabel(
  type: SessionType,
  remoteProtocol?: RemoteDesktopProtocol,
): string {
  if (type === "remoteDesktop") {
    return remoteProtocol ? remoteProtocol.toUpperCase() : "Remote";
  }
  return TYPE_LABELS[type];
}

function isSameSessionKind(
  session: Pick<TerminalSession, "host" | "type" | "remoteProtocol">,
  host: SSHHost,
  type: SessionType,
  remoteProtocol?: RemoteDesktopProtocol,
): boolean {
  if (session.host.id !== host.id || session.type !== type) return false;
  if (type !== "remoteDesktop") return true;
  return session.remoteProtocol === remoteProtocol;
}

/** open-tabs tabType is shared with the web app; map our session types to it. */
function toTabType(
  type: SessionType,
  remoteProtocol: RemoteDesktopProtocol | undefined,
  client: AccountClient | null,
): string {
  switch (type) {
    case "filemanager":
      return "files";
    case "stats":
      // 2.9+ web names this tab after its plugin.
      return client?.isPluginApi() ? "host-metrics" : "stats";
    case "remoteDesktop":
      return remoteProtocol ?? "rdp";
    default:
      return type;
  }
}

function uuid(): string {
  // RN-safe UUID v4 (crypto.randomUUID is not always available).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface TerminalSessionsContextType {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  /** Background tab records that exist server-side but aren't open here. */
  backgroundTabRecords: OpenTabRecord[];
  refreshBackgroundTabs: () => Promise<void>;
  addSession: (
    host: SSHHost,
    type?: SessionType,
    opts?: {
      instanceId?: string;
      restoredSessionId?: string | null;
      remoteProtocol?: RemoteDesktopProtocol;
    },
  ) => string;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  /** Persist the backend session id created/attached for a tab (cross-device). */
  setBackendSessionId: (sessionId: string, backendId: string | null) => void;
  /** Forget a server-side background tab record. */
  forgetBackgroundTab: (recordId: string) => void;
  navigateToSessions: (
    host?: SSHHost,
    type?: SessionType,
    opts?: { remoteProtocol?: RemoteDesktopProtocol },
  ) => void;
  isCustomKeyboardVisible: boolean;
  toggleCustomKeyboard: () => void;
  lastKeyboardHeight: number;
  setLastKeyboardHeight: (height: number) => void;
  keyboardIntentionallyHiddenRef: React.MutableRefObject<boolean>;
  setKeyboardIntentionallyHidden: (hidden: boolean) => void;
}

const TerminalSessionsContext = createContext<
  TerminalSessionsContextType | undefined
>(undefined);

export const useTerminalSessions = () => {
  const context = useContext(TerminalSessionsContext);
  if (context === undefined) {
    throw new Error(
      "useTerminalSessions must be used within a TerminalSessionsProvider",
    );
  }
  return context;
};

interface TerminalSessionsProviderProps {
  children: ReactNode;
}

export const TerminalSessionsProvider: React.FC<
  TerminalSessionsProviderProps
> = ({ children }) => {
  const { isAuthenticated } = useAppContext();
  const activeAccountId = useActiveAccount().id;
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [backgroundTabRecords, setBackgroundTabRecords] = useState<
    OpenTabRecord[]
  >([]);
  const [isCustomKeyboardVisible, setIsCustomKeyboardVisible] = useState(false);
  const [lastKeyboardHeight, setLastKeyboardHeight] = useState(300);
  const keyboardIntentionallyHiddenRef = useRef(false);
  const [, forceUpdate] = useState({});

  const refreshBackgroundTabs = useCallback(async () => {
    const client = accounts.activeClient();
    setBackgroundTabRecords(
      client ? await client.api.openTabs.getOpenTabs() : [],
    );
  }, []);

  const addSession = useCallback(
    (
      host: SSHHost,
      type: SessionType = "terminal",
      opts?: {
        instanceId?: string;
        restoredSessionId?: string | null;
        remoteProtocol?: RemoteDesktopProtocol;
      },
    ): string => {
      const instanceId = opts?.instanceId ?? uuid();
      const accountId = accounts.active().id;
      const client = clientFor(accountId);
      const sessionId = `${host.id}-${type}-${Date.now()}`;

      setSessions((prev) => {
        const existingSessions = prev.filter((session) =>
          isSameSessionKind(session, host, type, opts?.remoteProtocol),
        );

        const typeLabel = getSessionTypeLabel(type, opts?.remoteProtocol);
        let title = typeLabel ? `${host.name} - ${typeLabel}` : host.name;
        if (existingSessions.length > 0) {
          title = typeLabel
            ? `${host.name} - ${typeLabel} (${existingSessions.length + 1})`
            : `${host.name} (${existingSessions.length + 1})`;
        }

        const newSession: TerminalSession = {
          id: sessionId,
          accountId,
          host,
          title,
          isActive: true,
          createdAt: new Date(),
          type,
          instanceId,
          backendSessionId: opts?.restoredSessionId ?? null,
          restoredSessionId: opts?.restoredSessionId ?? null,
          remoteProtocol: opts?.remoteProtocol,
        };

        // Persist this tab server-side for cross-device awareness.
        client?.api.openTabs.addOpenTab({
          id: instanceId,
          tabType: toTabType(type, opts?.remoteProtocol, client),
          hostId: host.id,
          label: title,
          tabOrder: prev.length,
          backendSessionId: opts?.restoredSessionId ?? null,
        });

        const updatedSessions = prev.map((session) => ({
          ...session,
          isActive: false,
        }));
        return [...updatedSessions, newSession];
      });

      setActiveSessionId(sessionId);
      return sessionId;
    },
    [],
  );

  const removeSession = useCallback((sessionId: string) => {
    // All reads of activeSessionId happen inside the setSessions updater so we
    // always see the latest state regardless of how quickly sessions are removed.
    setSessions((prev) => {
      const sessionToRemove = prev.find((session) => session.id === sessionId);
      if (!sessionToRemove) return prev;

      // Forget the server-side record for this tab.
      clientFor(sessionToRemove.accountId)?.api.openTabs.deleteOpenTab(
        sessionToRemove.instanceId,
      );

      let updatedSessions = prev.filter((session) => session.id !== sessionId);

      // Re-number sibling sessions of the same host/type.
      const sessionType = sessionToRemove.type;
      const remoteProtocol = sessionToRemove.remoteProtocol;
      const sameHostSessions = updatedSessions.filter((session) =>
        isSameSessionKind(
          session,
          sessionToRemove.host,
          sessionType,
          remoteProtocol,
        ),
      );

      if (sameHostSessions.length > 0) {
        sameHostSessions.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
        sameHostSessions.forEach((session, index) => {
          const sessionIndex = updatedSessions.findIndex(
            (s) => s.id === session.id,
          );
          if (sessionIndex !== -1) {
            const typeLabel = getSessionTypeLabel(
              session.type,
              session.remoteProtocol,
            );
            const baseName = typeLabel
              ? `${session.host.name} - ${typeLabel}`
              : session.host.name;
            updatedSessions[sessionIndex] = {
              ...session,
              title: index === 0 ? baseName : `${baseName} (${index + 1})`,
            };
          }
        });
      }

      // Check whether the removed session was the active one - and if so pick a
      // new active session. Using setActiveSessionId inside a setSessions updater
      // is safe: React batches these in the same flush.
      const removedWasActive = !updatedSessions.some((s) => s.isActive);
      if (removedWasActive) {
        if (updatedSessions.length > 0) {
          const newActive = updatedSessions[updatedSessions.length - 1];
          setActiveSessionId(newActive.id);
          updatedSessions = updatedSessions.map((s) => ({
            ...s,
            isActive: s.id === newActive.id,
          }));
        } else {
          setActiveSessionId(null);
        }
      }

      return updatedSessions;
    });
  }, []);

  const setActiveSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const newSession = prev.find((s) => s.id === sessionId);

        if (newSession?.type !== "terminal" && isCustomKeyboardVisible) {
          setIsCustomKeyboardVisible(false);
        }

        return prev.map((session) => ({
          ...session,
          isActive: session.id === sessionId,
        }));
      });
      setActiveSessionId(sessionId);
    },
    [isCustomKeyboardVisible],
  );

  const setBackendSessionId = useCallback(
    (sessionId: string, backendId: string | null) => {
      setSessions((prev) => {
        const target = prev.find((s) => s.id === sessionId);
        if (!target) return prev;
        clientFor(target.accountId)?.api.openTabs.patchOpenTab(
          target.instanceId,
          { backendSessionId: backendId },
        );
        return prev.map((s) =>
          s.id === sessionId
            ? { ...s, backendSessionId: backendId, restoredSessionId: null }
            : s,
        );
      });
    },
    [],
  );

  const forgetBackgroundTab = useCallback((recordId: string) => {
    setBackgroundTabRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const navigateToSessions = useCallback(
    (
      host?: SSHHost,
      type: SessionType = "terminal",
      opts?: { remoteProtocol?: RemoteDesktopProtocol },
    ) => {
      if (host) {
        const feature = sessionFeature(
          type,
          opts?.remoteProtocol ?? host.connectionType,
        );
        const client = accounts.activeClient();
        if (!client) {
          toast.error("Link a Termix server to connect to hosts.");
          return;
        }
        if (feature && !client.hasFeature(feature)) {
          toast.error("This feature is turned off on the server.");
          return;
        }
        addSession(host, type, opts);
      }
      router.push("/(tabs)/sessions");
    },
    [addSession],
  );

  const toggleCustomKeyboard = useCallback(() => {
    setIsCustomKeyboardVisible((prev) => !prev);
  }, []);

  const setKeyboardIntentionallyHidden = useCallback((hidden: boolean) => {
    keyboardIntentionallyHiddenRef.current = hidden;
    forceUpdate({});
  }, []);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setActiveSessionId(null);
    setBackgroundTabRecords([]);
    setIsCustomKeyboardVisible(false);
    keyboardIntentionallyHiddenRef.current = false;
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      // Hydrate background tab records (e.g. tabs opened on another device).
      refreshBackgroundTabs();
      return;
    }
    setBackgroundTabRecords([]);
    // Only a real sign out closes tabs. Switching accounts keeps them open.
    const client = clientFor(activeAccountId);
    if (client && !client.isAuthenticated()) {
      setSessions((prev) => {
        const kept = prev.filter((s) => s.accountId !== activeAccountId);
        if (kept.length === prev.length) return prev;
        if (!kept.some((s) => s.isActive)) {
          const last = kept[kept.length - 1];
          setActiveSessionId(last?.id ?? null);
          return kept.map((s) => ({ ...s, isActive: s.id === last?.id }));
        }
        return kept;
      });
    }
  }, [isAuthenticated, activeAccountId, refreshBackgroundTabs]);

  return (
    <TerminalSessionsContext.Provider
      value={{
        sessions,
        activeSessionId,
        backgroundTabRecords,
        refreshBackgroundTabs,
        addSession,
        removeSession,
        setActiveSession,
        clearAllSessions,
        setBackendSessionId,
        forgetBackgroundTab,
        navigateToSessions,
        isCustomKeyboardVisible,
        toggleCustomKeyboard,
        lastKeyboardHeight,
        setLastKeyboardHeight,
        keyboardIntentionallyHiddenRef,
        setKeyboardIntentionallyHidden,
      }}
    >
      {children}
    </TerminalSessionsContext.Provider>
  );
};

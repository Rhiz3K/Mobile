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
import { toast } from "@/utils/toast";
import { accounts, clientFor, useActiveAccount } from "@/core/accounts";
import type { AccountClient } from "@/core/api/AccountClient";
import type { OpenTabRecord } from "@/core/api/types";
import type {
  Blocked,
  ConnectionOrigin,
  TransportKind,
} from "@/core/transport";
import { checkOpen, features } from "@/core/features";
import { isSshHost } from "@/utils/hosts";

/** Session tab type. The registry knows which feature owns each one. */
export type SessionType = string;

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
  /** Protocol for tabs that open more than one, like remote desktop. */
  remoteProtocol?: string;
  /** Overrides the host's origin, like a tab reopened from another device. */
  origin?: ConnectionOrigin;
  /** Whether the server lists this tab for other devices (relay only). */
  listed?: boolean;
}

function getSessionTypeLabel(type: SessionType, remoteProtocol?: string) {
  return features.sessionTab(type)?.titleSuffix({ remoteProtocol }) ?? "";
}

function isSameSessionKind(
  session: Pick<TerminalSession, "host" | "type" | "remoteProtocol">,
  host: SSHHost,
  type: SessionType,
  remoteProtocol?: string,
): boolean {
  if (session.host.id !== host.id || session.type !== type) return false;
  return (session.remoteProtocol ?? null) === (remoteProtocol ?? null);
}

/** open-tabs tabType is shared with the web app. */
function toTabType(
  type: SessionType,
  remoteProtocol: string | undefined,
  client: AccountClient | null,
): string {
  return (
    features.sessionTab(type)?.toServerTabType({ remoteProtocol }, client) ??
    type
  );
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
      remoteProtocol?: string;
      origin?: ConnectionOrigin;
    },
  ) => string;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  /** Persist the backend session id created/attached for a tab (cross-device). */
  setBackendSessionId: (sessionId: string, backendId: string | null) => void;
  /** A tab's connection picked its way; relay tabs get listed for other devices. */
  setSessionTransport: (sessionId: string, kind: TransportKind) => void;
  /** Forget a server-side background tab record. */
  forgetBackgroundTab: (recordId: string) => void;
  /** Opens a tab and the sessions screen. Resolves to why it can't, if it can't. */
  navigateToSessions: (
    host?: SSHHost,
    type?: SessionType,
    opts?: { remoteProtocol?: string; quiet?: boolean },
  ) => Promise<Blocked | null>;
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
      type: SessionType = features.defaultSessionType(),
      opts?: {
        instanceId?: string;
        restoredSessionId?: string | null;
        remoteProtocol?: string;
        origin?: ConnectionOrigin;
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
          // A server session from another device can only attach through it.
          origin:
            opts?.origin ?? (opts?.restoredSessionId ? "server" : undefined),
        };

        // Persist this tab server-side for cross-device awareness.
        // Server-only tabs are listed for other devices right away. A shell
        // waits until it knows whether it goes through the server.
        if (client && features.serverOnly(type)) {
          newSession.listed = true;
          client.api.openTabs.addOpenTab({
            id: instanceId,
            tabType: toTabType(type, opts?.remoteProtocol, client),
            hostId: host.id,
            label: title,
            tabOrder: prev.length,
            backendSessionId: opts?.restoredSessionId ?? null,
          });
        }

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
      if (sessionToRemove.listed) {
        clientFor(sessionToRemove.accountId)?.api.openTabs.deleteOpenTab(
          sessionToRemove.instanceId,
        );
      }

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

        if (
          !features.sessionHas(newSession?.type, "terminal-input") &&
          isCustomKeyboardVisible
        ) {
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
        if (target.listed) {
          clientFor(target.accountId)?.api.openTabs.patchOpenTab(
            target.instanceId,
            { backendSessionId: backendId },
          );
        }
        return prev.map((s) =>
          s.id === sessionId
            ? { ...s, backendSessionId: backendId, restoredSessionId: null }
            : s,
        );
      });
    },
    [],
  );

  const setSessionTransport = useCallback(
    (sessionId: string, kind: TransportKind) => {
      setSessions((prev) => {
        const target = prev.find((s) => s.id === sessionId);
        if (!target) return prev;
        const client = clientFor(target.accountId);
        const listed = kind === "relay" && !!client;
        if (listed === !!target.listed) return prev;
        if (client && listed) {
          client.api.openTabs.addOpenTab({
            id: target.instanceId,
            tabType: toTabType(target.type, target.remoteProtocol, client),
            hostId: target.host.id,
            label: target.title,
            tabOrder: prev.indexOf(target),
            backendSessionId: target.backendSessionId ?? null,
          });
        } else {
          client?.api.openTabs.deleteOpenTab(target.instanceId);
        }
        return prev.map((s) => (s.id === sessionId ? { ...s, listed } : s));
      });
    },
    [],
  );

  const forgetBackgroundTab = useCallback((recordId: string) => {
    setBackgroundTabRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const navigateToSessions = useCallback(
    async (
      host?: SSHHost,
      type: SessionType = features.defaultSessionType(),
      opts?: { remoteProtocol?: string; quiet?: boolean },
    ): Promise<Blocked | null> => {
      if (host) {
        const accountId = accounts.active().id;
        const ctx = {
          account: accounts.active(),
          client: accounts.activeClient(),
        };
        const remoteProtocol = opts?.remoteProtocol ?? host.connectionType;
        if (!features.canOpen(type, { remoteProtocol }, ctx)) {
          const blocked = {
            reason: "This feature is turned off on the server.",
          };
          if (!opts?.quiet) toast.error(blocked.reason);
          return blocked;
        }
        const check = await checkOpen(accountId, host, isSshHost(host), type);
        if (check.blocked) {
          if (!opts?.quiet) toast.error(check.blocked.reason);
          return check.blocked;
        }
        addSession(host, type, { remoteProtocol: opts?.remoteProtocol });
      }
      router.push("/(tabs)/sessions");
      return null;
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
        setSessionTransport,
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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useSessionAccountId } from "@/core/accounts/session";
import { checkOpen } from "@/core/features";
import {
  HostConnection,
  originInputs,
  planConnection,
  saveOrigin,
  type ConnectionOrigin,
  type ConnectionStatus,
  type RelayTmuxSession,
  type TerminalHostConfig,
  type TransportKind,
} from "@/core/transport";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";

export interface HostConnectionHandlers {
  onData: (data: string) => void;
  onConnected?: (info: {
    fromBackground: boolean;
    isReattach: boolean;
  }) => void;
  onPostConnectionSetup?: () => void;
  onDisconnected?: (hostName: string) => void;
  onSessionIdChange?: (sessionId: string | null) => void;
  onTransportResolved?: (kind: TransportKind) => void;
  onTmuxSessions?: (sessions: RelayTmuxSession[]) => void;
}

// Failures where trying the other way can help.
const SWITCHABLE = new Set([
  "network",
  "proxy",
  "server",
  "session",
  "unavailable",
]);

/**
 * One host connection for a session tab, through whichever way the host's
 * origin picks. The tab renders `state` and the shared prompt and error views.
 */
export function useHostConnection(
  host: Pick<SSHHost, "id" | "connectFrom">,
  hostConfig: TerminalHostConfig,
  opts: HostConnectionHandlers & {
    /** Session tab type, for what it needs from the transport. */
    type: string;
    isSsh?: boolean;
    origin?: ConnectionOrigin;
    tabInstanceId?: string;
    initialSessionId?: string | null;
    /** Native pipe of the tab's terminal view. */
    pipeId?: string;
  },
) {
  const accountId = useSessionAccountId();
  const isSsh = opts.isSsh ?? true;
  const handlers = useRef(opts);
  useEffect(() => {
    handlers.current = opts;
  });
  const originRef = useRef(opts.origin);

  const conn = useMemo(
    () =>
      new HostConnection({
        host: hostConfig,
        plan: () =>
          checkOpen(accountId, host, isSsh, opts.type, originRef.current),
        tabInstanceId: opts.tabInstanceId,
        initialSessionId: opts.initialSessionId,
        pipeId: opts.pipeId,
        onData: (d) => handlers.current.onData(d),
        onConnected: (i) => handlers.current.onConnected?.(i),
        onPostConnectionSetup: () => handlers.current.onPostConnectionSetup?.(),
        onDisconnected: (n) => handlers.current.onDisconnected?.(n),
        onSessionIdChange: (id) => handlers.current.onSessionIdChange?.(id),
        onOriginResolved: (k) => handlers.current.onTransportResolved?.(k),
        onTmuxSessions: (s) => handlers.current.onTmuxSessions?.(s),
      }),
    // A new connection only for another host or account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hostConfig.id, accountId],
  );
  useEffect(() => () => conn.destroy(), [conn]);

  const snapshot = useSyncExternalStore(
    conn.subscribe,
    conn.getSnapshot,
    conn.getSnapshot,
  );
  const state: ConnectionStatus = snapshot.state;

  /** Another origin worth offering after a failure. */
  const switchTo = useMemo((): ConnectionOrigin | undefined => {
    if (state.status !== "failed") return undefined;
    if (state.fix) return state.fix;
    if (!SWITCHABLE.has(state.failure.stage)) return undefined;
    const inputs = originInputs(accountId, isSsh);
    const failed = state.failure.origin;
    return (["server", "device"] as const).find((o) => {
      const first = planConnection(o, inputs).attempts[0];
      return first && first.kind !== failed;
    });
  }, [state, accountId, isSsh]);

  /** Saves the origin on the host and connects that way. */
  const switchOrigin = useCallback(
    (origin: ConnectionOrigin) => {
      originRef.current = origin;
      saveOrigin(accountId, host.id, origin).catch((err) =>
        toast.error(
          "Could not save how this host connects",
          err instanceof Error ? err.message : undefined,
        ),
      );
      void conn.retry();
    },
    [accountId, host.id, conn],
  );

  return { conn, state, log: snapshot.log, switchTo, switchOrigin };
}

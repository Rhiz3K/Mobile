import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionAccountId } from "@/core/accounts/session";
import { useSessionRepositories } from "@/core/data/hooks";
import type { DataRepositories } from "@/core/data/types";
import { checkOpen } from "@/core/features/open-check";
import { asServerHost, isSynced } from "@/core/sync";
import {
  fromError,
  type ConnectFailure,
  type ConnectionOrigin,
} from "@/core/transport";
import type { SSHHost } from "@/types";
import { toTerminalHostConfig } from "@/utils/hosts";
import { createRunner } from "./runner";
import type { ExecRunner } from "./types";

export type ExecTarget =
  | { phase: "connecting" }
  /** Use the server's plugin routes for `host` (the server's own copy). */
  | { phase: "relay"; host: SSHHost }
  | { phase: "local"; runner: ExecRunner }
  | { phase: "failed"; failure: ConnectFailure; fix?: ConnectionOrigin };

/** Failures where the next way to connect might still work. */
const FALL_THROUGH = new Set(["network", "proxy", "unavailable"]);

export function execKey(accountId: string | null, hostId: number): string {
  return `${accountId ?? "device"}:${hostId}`;
}

/**
 * Works out how a feature of tab `type` reaches `host`: the phone's own SSH
 * when the plan says so, else the server's plugin. A local target is logged
 * in already; release its runner when done.
 */
export async function resolveExecTarget(input: {
  accountId: string | null;
  host: SSHHost;
  type: string;
  repos?: DataRepositories;
  origin?: ConnectionOrigin;
  /** Login before answering. Cards skip it and let the first run log in. */
  connect?: boolean;
}): Promise<Exclude<ExecTarget, { phase: "connecting" }>> {
  const { accountId, host, type } = input;
  const check = await checkOpen(accountId, host, true, type, input.origin);
  if (check.blocked || !check.attempts.length) {
    return {
      phase: "failed",
      failure: {
        stage: "unavailable",
        message: check.blocked?.reason ?? "Can't connect.",
        hint: "",
      },
      fix: check.blocked?.fix,
    };
  }
  let last: ConnectFailure | null = null;
  for (const [i, transport] of check.attempts.entries()) {
    const hasNext = i < check.attempts.length - 1;
    if (transport.kind === "relay") {
      const serverHost =
        accountId && isSynced(accountId)
          ? await asServerHost(accountId, host).catch(() => host)
          : host;
      return { phase: "relay", host: serverHost };
    }
    const runner = createRunner({
      key: execKey(accountId, host.id),
      hostId: host.id,
      hostName: host.name || host.ip,
      open: () => {
        if (!transport.openSession)
          throw new Error("This way can't run commands");
        return transport.openSession(toTerminalHostConfig(host));
      },
      savedSudoPassword: async () =>
        (await input.repos?.hosts.get(host.id))?.sudoPassword ??
        host.sudoPassword,
    });
    if (input.connect === false) return { phase: "local", runner };
    try {
      await runner.ready();
      return { phase: "local", runner };
    } catch (error) {
      runner.release();
      last = { ...fromError(error), origin: "local" };
      if (!hasNext || !FALL_THROUGH.has(last.stage)) break;
    }
  }
  return {
    phase: "failed",
    failure: last ?? {
      stage: "unavailable",
      message: "Can't connect.",
      hint: "",
    },
  };
}

/**
 * The exec target for a tab, resolved the first time the tab shows. The
 * local runner is released when the tab closes.
 */
export function useExecTarget(
  host: SSHHost,
  type: string,
  active: boolean,
  origin?: ConnectionOrigin,
) {
  const accountId = useSessionAccountId();
  const repos = useSessionRepositories();
  const [target, setTarget] = useState<ExecTarget>({ phase: "connecting" });
  const [override, setOverride] = useState<ConnectionOrigin | undefined>(
    origin,
  );
  const [started, setStarted] = useState(false);
  const run = useRef(0);
  const hostRef = useRef(host);
  hostRef.current = host;
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const runnerRef = useRef<ExecRunner | null>(null);

  const drop = () => {
    runnerRef.current?.release();
    runnerRef.current = null;
  };

  const connect = useCallback(async () => {
    const id = ++run.current;
    drop();
    setTarget({ phase: "connecting" });
    const next = await resolveExecTarget({
      accountId,
      host: hostRef.current,
      type,
      repos: reposRef.current,
      origin: override,
    }).catch((error): ExecTarget => ({
      phase: "failed",
      failure: fromError(error),
    }));
    if (id !== run.current) {
      if (next.phase === "local") next.runner.release();
      return;
    }
    if (next.phase === "local") runnerRef.current = next.runner;
    setTarget(next);
  }, [accountId, host.id, type, override]);

  useEffect(() => {
    if (active && !started) setStarted(true);
  }, [active, started]);

  useEffect(() => {
    if (started) void connect();
  }, [started, connect]);

  useEffect(
    () => () => {
      run.current++;
      drop();
    },
    [],
  );

  return { target, retry: connect, switchOrigin: setOverride };
}

import { LOCAL_ACCOUNT_ID } from "@/core/accounts/types";
import { repositoriesFor } from "@/core/data/repositories";
import type { HostConnectRepository } from "@/core/data/types";
import { AppError } from "@/core/errors";
import { isSshEngineAvailable } from "@/modules/termix-ssh";
import type { HostSession, Transport } from "../types";
import { closeAll, openChain } from "./chain";
import { autoAnswer } from "./kbd";
import { LocalShell } from "./LocalShell";

const REASON =
  "This build has no SSH engine. Use the app from the store, or link a Termix server to connect.";

const deviceRepo = (): HostConnectRepository | undefined =>
  repositoriesFor({ id: LOCAL_ACCOUNT_ID, kind: "local" }, null).connect;

/** The phone opening SSH itself, through modules/termix-ssh. */
export function createLocalTransport(
  available: boolean,
  repo: () => HostConnectRepository | undefined = deviceRepo,
): Transport {
  const refuse = () => new AppError(REASON, "TRANSPORT_UNAVAILABLE");
  return {
    kind: "local",
    available,
    unavailableReason: available ? undefined : REASON,
    openShell(options) {
      if (!available) throw refuse();
      return new LocalShell(options, repo);
    },
    async openSession(host, options = {}): Promise<HostSession> {
      if (!available) throw refuse();
      // Nobody to ask: only saved logins and a trusted (or first seen) host key.
      const chain = await openChain(repo(), host, null, {
        askHostKey: null,
        askKbd: async (req, login) => autoAnswer(req.prompts, login.password),
        signal: options.signal,
      });
      const { target } = chain;
      return {
        exec: (command, opts) => target.exec(command, opts),
        sftp: target.sftp,
        close: async () => closeAll([...chain.hops, target]),
      };
    },
  };
}

export const localTransport = createLocalTransport(isSshEngineAvailable);

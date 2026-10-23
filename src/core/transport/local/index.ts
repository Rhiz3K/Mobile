import { LOCAL_ACCOUNT_ID } from "@/core/accounts/types";
import { repositoriesFor } from "@/core/data/repositories";
import type { HostConnectRepository } from "@/core/data/types";
import { AppError } from "@/core/errors";
import { isSshEngineAvailable } from "@/modules/termix-ssh";
import type { HostSession, Transport } from "../types";
import { closeAll, openChain } from "./chain";
import { autoAnswer } from "./kbd";
import { LocalShell } from "./LocalShell";

export const NO_ENGINE =
  "This build has no SSH engine. Use the app from the store, or link a Termix server to connect.";
export const NO_DEVICE_STORE = "The hosts on this phone are not open yet.";
export const NO_SERVER_COPY =
  "This server's hosts are not on this phone. Turn on the Sync plugin on the server to connect from the phone.";

const deviceRepo = (): HostConnectRepository | undefined =>
  repositoriesFor({ id: LOCAL_ACCOUNT_ID, kind: "local" }, null).connect;

/**
 * The phone opening SSH itself, through modules/termix-ssh. `repo` is the
 * account's local store; without one there is nothing to connect with.
 */
export function createLocalTransport(
  engine: boolean,
  repo: () => HostConnectRepository | undefined = deviceRepo,
  noStoreReason = NO_DEVICE_STORE,
): Transport {
  const reason = () =>
    !engine ? NO_ENGINE : repo() ? undefined : noStoreReason;
  const refuse = () => new AppError(reason() ?? "", "TRANSPORT_UNAVAILABLE");
  return {
    kind: "local",
    provides: ["shell", "exec", "sftp"],
    get available() {
      return !reason();
    },
    get unavailableReason() {
      return reason();
    },
    openShell(options) {
      if (reason()) throw refuse();
      return new LocalShell(options, repo);
    },
    async openSession(host, options = {}): Promise<HostSession> {
      if (reason()) throw refuse();
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

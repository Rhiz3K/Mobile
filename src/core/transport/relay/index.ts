import type { AccountClient } from "@/core/api/AccountClient";
import type { Transport } from "../types";
import { RelayShell } from "./RelayShell";

/** Connects through a linked Termix server, which opens SSH for us. */
export function createRelayTransport(client: AccountClient): Transport {
  return {
    kind: "relay",
    available: true,
    openShell: (options) => new RelayShell({ ...options, client }),
  };
}

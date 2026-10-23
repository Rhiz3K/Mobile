import { accounts, useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import type { AccountClient } from "@/core/api/AccountClient";
import { localTransport } from "./local";
import { createRelayTransport } from "./relay";
import type { Transport } from "./types";

export * from "./types";

const relays = new WeakMap<AccountClient, Transport>();

/**
 * This device connects on its own, a linked server relays. Hosts will be able
 * to pick per host later; for now the account decides.
 */
export function pickTransport(client: AccountClient | null): Transport {
  if (!client) return localTransport;
  let relay = relays.get(client);
  if (!relay) {
    relay = createRelayTransport(client);
    relays.set(client, relay);
  }
  return relay;
}

export function transportFor(accountId: string): Transport {
  return pickTransport(accounts.client(accountId));
}

/** Transport of the account that owns the surrounding session. */
export function useSessionTransport(): Transport {
  return pickTransport(useClient(useSessionAccountId()));
}

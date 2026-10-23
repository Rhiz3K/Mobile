import type { Account } from "@/core/accounts/types";
import type { AccountClient } from "@/core/api/AccountClient";
import { localStores } from "@/core/db/stores";
import { AppError } from "@/core/errors";
import { localRepositories } from "./local";
import { serverRepositories } from "./server";
import type { DataRepositories, Repository } from "./types";

export * from "./types";
export { serverRepositories } from "./server";
export { localRepositories } from "./local";

const noop = () => () => {};

const refuse = (what: string) => async (): Promise<never> => {
  throw new AppError(`This device can't save ${what} here.`, "NO_LOCAL_STORE");
};

function emptyRepository<T, Draft>(what: string): Repository<T, Draft> {
  return {
    subscribe: noop,
    list: async () => [],
    get: async () => null,
    create: refuse(what),
    update: refuse(what),
    remove: refuse(what),
  };
}

/** Where there is no encrypted store (web). Reads are empty, writes refuse. */
export const emptyRepositories: DataRepositories = {
  source: "none",
  hosts: emptyRepository("hosts"),
  hostFolders: { subscribe: noop, list: async () => [] },
  credentials: emptyRepository("logins"),
  snippets: { ...emptyRepository("snippets"), reorder: refuse("snippets") },
  snippetFolders: {
    subscribe: noop,
    list: async () => [],
    create: refuse("snippets"),
    rename: refuse("snippets"),
    remove: refuse("snippets"),
  },
  commandHistory: {
    list: async () => [],
    add: async () => {},
    remove: async () => {},
    clear: async () => {},
  },
  recentActivity: {
    subscribe: noop,
    list: async () => [],
    add: async () => {},
  },
};

const cache = new Map<string, DataRepositories>();
const serverCache = new WeakMap<AccountClient, DataRepositories>();

/**
 * This device uses its encrypted store. A linked server is read live until
 * sync (B3) fills its own local copy.
 */
export function repositoriesFor(
  account: Account,
  client: AccountClient | null,
): DataRepositories {
  if (account.kind === "server" && client) {
    let repos = serverCache.get(client);
    if (!repos) {
      repos = serverRepositories(client);
      serverCache.set(client, repos);
    }
    return repos;
  }
  if (account.kind === "server") return emptyRepositories;
  if (!localStores.getState().available) return emptyRepositories;
  let repos = cache.get(account.id);
  if (!repos) {
    repos = localRepositories(account.id);
    cache.set(account.id, repos);
  }
  return repos;
}

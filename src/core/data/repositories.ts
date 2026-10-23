import type { Account } from "@/core/accounts/types";
import type { AccountClient } from "@/core/api/AccountClient";
import { AppError } from "@/core/errors";
import type { Credential, SSHHost, SSHHostData, Snippet } from "@/types";

/**
 * Where an account keeps hosts, logins and snippets. Linked servers read and
 * write the server today; This device gets its own encrypted store later.
 * Screens move onto these as each data type goes local.
 */
export interface Repository<T, Draft> {
  list(): Promise<T[]>;
  create(draft: Draft): Promise<T>;
  update(id: number, draft: Draft): Promise<T>;
  remove(id: number): Promise<void>;
}

export interface DataRepositories {
  hosts: Repository<SSHHost, SSHHostData>;
  credentials: Repository<Credential, Partial<Credential>>;
  snippets: Repository<Snippet, Partial<Snippet>>;
}

const asList = <T>(data: unknown, key: string): T[] => {
  if (Array.isArray(data)) return data as T[];
  const nested = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(nested) ? (nested as T[]) : [];
};

export function serverRepositories(client: AccountClient): DataRepositories {
  const { hosts, credentials, snippets } = client.api;
  return {
    hosts: {
      list: () => hosts.getSSHHosts(),
      create: (draft) => hosts.createSSHHost(draft),
      update: (id, draft) => hosts.updateSSHHost(id, draft),
      remove: async (id) => {
        await hosts.deleteSSHHost(id);
      },
    },
    credentials: {
      list: async () =>
        asList<Credential>(await credentials.getCredentials(), "credentials"),
      create: (draft) => credentials.createCredential(draft),
      update: (id, draft) => credentials.updateCredential(id, draft),
      remove: async (id) => {
        await credentials.deleteCredential(id);
      },
    },
    snippets: {
      list: async () =>
        asList<Snippet>(await snippets.getSnippets(), "snippets"),
      create: (draft) => snippets.createSnippet(draft),
      update: (id, draft) => snippets.updateSnippet(id, draft),
      remove: async (id) => {
        await snippets.deleteSnippet(id);
      },
    },
  };
}

function emptyRepository<T, Draft>(what: string): Repository<T, Draft> {
  const notYet = async (): Promise<never> => {
    throw new AppError(`This device can't save ${what} yet.`, "NO_SERVER");
  };
  return {
    list: async () => [],
    create: notYet,
    update: notYet,
    remove: notYet,
  };
}

/** This device for now: empty until the local store lands. */
export const localRepositories: DataRepositories = {
  hosts: emptyRepository("hosts"),
  credentials: emptyRepository("logins"),
  snippets: emptyRepository("snippets"),
};

export function repositoriesFor(
  account: Account,
  client: AccountClient | null,
): DataRepositories {
  if (account.kind === "local" || !client) return localRepositories;
  return serverRepositories(client);
}

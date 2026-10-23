import type { AccountClient } from "@/core/api/AccountClient";
import type { Credential, Snippet, SnippetFolder } from "@/types";
import type { DataRepositories } from "./types";

const asList = <T>(data: unknown, key: string): T[] => {
  if (Array.isArray(data)) return data as T[];
  const nested = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(nested) ? (nested as T[]) : [];
};

/** A tiny signal per domain, so lists reload after this app's own writes. */
function signal() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    after<T>(promise: Promise<T>): Promise<T> {
      return promise.then((value) => {
        listeners.forEach((listener) => listener());
        return value;
      });
    },
  };
}

/** A linked server, read and written live until sync fills its local copy. */
export function serverRepositories(client: AccountClient): DataRepositories {
  const { hosts, credentials, snippets, folders, terminal } = client.api;
  const hostChanges = signal();
  const credentialChanges = signal();
  const snippetChanges = signal();

  return {
    source: "server",
    hosts: {
      subscribe: hostChanges.subscribe,
      list: () => hosts.getSSHHosts(),
      // The full host, with its secrets, for the editor.
      get: async (id) =>
        (await credentials.getSSHHostWithCredentials(id)) ?? null,
      create: (draft) => hostChanges.after(hosts.createSSHHost(draft)),
      update: (id, draft) => hostChanges.after(hosts.updateSSHHost(id, draft)),
      remove: (id) => hostChanges.after(hosts.deleteSSHHost(id).then(() => {})),
    },
    hostFolders: {
      subscribe: hostChanges.subscribe,
      list: async () =>
        asList<{ name?: string; color?: string; icon?: string }>(
          await folders.getFoldersWithStats(),
          "folders",
        )
          .filter((f) => typeof f?.name === "string")
          .map((f) => ({ name: f.name!, color: f.color, icon: f.icon })),
    },
    credentials: {
      subscribe: credentialChanges.subscribe,
      list: async () =>
        asList<Credential>(await credentials.getCredentials(), "credentials"),
      get: async (id) => (await credentials.getCredentialDetails(id)) ?? null,
      create: (draft) =>
        credentialChanges.after(credentials.createCredential(draft)),
      update: (id, draft) =>
        credentialChanges.after(credentials.updateCredential(id, draft)),
      remove: (id) =>
        credentialChanges.after(
          credentials.deleteCredential(id).then(() => {}),
        ),
    },
    snippets: {
      subscribe: snippetChanges.subscribe,
      list: async () =>
        asList<Snippet>(await snippets.getSnippets(), "snippets"),
      get: async (id) =>
        asList<Snippet>(await snippets.getSnippets(), "snippets").find(
          (s) => s.id === id,
        ) ?? null,
      create: (draft) => snippetChanges.after(snippets.createSnippet(draft)),
      update: (id, draft) =>
        snippetChanges.after(snippets.updateSnippet(id, draft)),
      remove: (id) =>
        snippetChanges.after(snippets.deleteSnippet(id).then(() => {})),
      reorder: (items) =>
        snippetChanges.after(snippets.reorderSnippets(items).then(() => {})),
    },
    snippetFolders: {
      subscribe: snippetChanges.subscribe,
      list: async () =>
        asList<SnippetFolder>(await snippets.getSnippetFolders(), "folders"),
      create: (folder) =>
        snippetChanges.after(
          snippets.createSnippetFolder(folder).then(() => {}),
        ),
      rename: (oldName, newName) =>
        snippetChanges.after(
          snippets.renameSnippetFolder(oldName, newName).then(() => {}),
        ),
      remove: (name) =>
        snippetChanges.after(snippets.deleteSnippetFolder(name).then(() => {})),
    },
    commandHistory: {
      list: (host) => terminal.getCommandHistory(host.id),
      add: (host, command) => terminal.saveCommandToHistory(host.id, command),
      remove: (host, command) =>
        terminal.deleteCommandFromHistory(host.id, command),
      clear: (host) => terminal.clearCommandHistory(host.id),
    },
    // The server keeps its own activity feed; nothing to record here.
    recentActivity: {
      subscribe: () => () => {},
      list: async () => [],
      add: async () => {},
    },
  };
}

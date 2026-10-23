import { and, asc, desc, eq, getTableName, notInArray } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import { AppError } from "@/core/errors";
import { changes } from "@/core/db/changes";
import type { LocalDb } from "@/core/db/driver";
import {
  commandHistory,
  credentials,
  folders,
  hosts,
  recentActivity,
  snippetFolders,
  snippets,
} from "@/core/db/schema";
import { localStores, type LocalStores } from "@/core/db/stores";
import type { SSHHost } from "@/types";
import type { DataRepositories } from "../types";
import {
  credentialFromRow,
  credentialToRow,
  hostFromRow,
  hostToRow,
  snippetFolderFromRow,
  snippetFromRow,
} from "./mappers";

export const HISTORY_LIMIT = 500;
export const ACTIVITY_LIMIT = 100;

const now = () => new Date().toISOString();

const notFound = (what: string) =>
  new AppError(`That ${what} no longer exists.`, "NOT_FOUND");

/** The encrypted store of one account. Every call waits for App Lock. */
export function localRepositories(
  accountId: string,
  stores: LocalStores = localStores,
): DataRepositories {
  const db = async (): Promise<LocalDb> => (await stores.get(accountId)).db;
  // Also fires on unlock, so a list read while locked fills in after.
  const watch =
    (...tables: { _: unknown }[]) =>
    (listener: () => void) => {
      const stopChanges = changes.subscribe(
        accountId,
        tables.map((t) => getTableName(t as never)),
        listener,
      );
      let unlocked = stores.getState().unlocked;
      const stopState = stores.subscribe(() => {
        const next = stores.getState().unlocked;
        if (next && !unlocked) listener();
        unlocked = next;
      });
      return () => {
        stopChanges();
        stopState();
      };
    };
  const touched = (...tables: { _: unknown }[]) =>
    tables.forEach((t) => changes.emit(accountId, getTableName(t as never)));

  // History is keyed by syncId, so it follows the host across devices.
  const hostKey = (host: SSHHost) => host.syncId || `id:${host.id}`;

  return {
    source: "local",
    hosts: {
      subscribe: watch(hosts),
      async list() {
        const rows = (await db()).select().from(hosts).all();
        return rows.map(hostFromRow);
      },
      async get(id) {
        const row = (await db())
          .select()
          .from(hosts)
          .where(eq(hosts.id, id))
          .get();
        return row ? hostFromRow(row) : null;
      },
      async create(draft) {
        const d = await db();
        const row = d
          .insert(hosts)
          .values({ ...hostToRow(draft, null), syncId: randomUUID() })
          .returning()
          .get();
        touched(hosts);
        return hostFromRow(row);
      },
      async update(id, draft) {
        const d = await db();
        const current = d.select().from(hosts).where(eq(hosts.id, id)).get();
        if (!current) throw notFound("host");
        const row = d
          .update(hosts)
          .set({ ...hostToRow(draft, current), updatedAt: now() })
          .where(eq(hosts.id, id))
          .returning()
          .get();
        touched(hosts);
        return hostFromRow(row);
      },
      async remove(id) {
        (await db()).delete(hosts).where(eq(hosts.id, id)).run();
        touched(hosts);
      },
    },

    hostFolders: {
      subscribe: watch(folders, hosts),
      async list() {
        return (await db())
          .select()
          .from(folders)
          .orderBy(asc(folders.sortOrder), asc(folders.name))
          .all()
          .map((f) => ({
            name: f.name,
            color: f.color ?? undefined,
            icon: f.icon ?? undefined,
          }));
      },
    },

    credentials: {
      subscribe: watch(credentials),
      async list() {
        return (await db())
          .select()
          .from(credentials)
          .orderBy(asc(credentials.name))
          .all()
          .map(credentialFromRow);
      },
      async get(id) {
        const row = (await db())
          .select()
          .from(credentials)
          .where(eq(credentials.id, id))
          .get();
        return row ? credentialFromRow(row) : null;
      },
      async create(draft) {
        if (!draft.name?.trim()) {
          throw new AppError("Name is required", "VALIDATION_ERROR");
        }
        const row = (await db())
          .insert(credentials)
          .values({ ...credentialToRow(draft, null), syncId: randomUUID() })
          .returning()
          .get();
        touched(credentials);
        return credentialFromRow(row);
      },
      async update(id, draft) {
        const d = await db();
        const current = d
          .select()
          .from(credentials)
          .where(eq(credentials.id, id))
          .get();
        if (!current) throw notFound("login");
        const row = d
          .update(credentials)
          .set({ ...credentialToRow(draft, current), updatedAt: now() })
          .where(eq(credentials.id, id))
          .returning()
          .get();
        touched(credentials);
        return credentialFromRow(row);
      },
      async remove(id) {
        (await db()).delete(credentials).where(eq(credentials.id, id)).run();
        // Hosts that used it lose the link (on delete set null).
        touched(credentials, hosts);
      },
    },

    snippets: {
      subscribe: watch(snippets),
      async list() {
        return (await db())
          .select()
          .from(snippets)
          .orderBy(asc(snippets.order), asc(snippets.name))
          .all()
          .map(snippetFromRow);
      },
      async get(id) {
        const row = (await db())
          .select()
          .from(snippets)
          .where(eq(snippets.id, id))
          .get();
        return row ? snippetFromRow(row) : null;
      },
      async create(draft) {
        if (!draft.name?.trim() || !draft.content) {
          throw new AppError(
            "Name and command are required",
            "VALIDATION_ERROR",
          );
        }
        const row = (await db())
          .insert(snippets)
          .values({
            syncId: randomUUID(),
            name: draft.name.trim(),
            content: draft.content,
            description: draft.description || null,
            folder: draft.folder || null,
            order: draft.order ?? 0,
          })
          .returning()
          .get();
        touched(snippets);
        return snippetFromRow(row);
      },
      async update(id, draft) {
        const d = await db();
        const current = d
          .select()
          .from(snippets)
          .where(eq(snippets.id, id))
          .get();
        if (!current) throw notFound("snippet");
        const row = d
          .update(snippets)
          .set({
            name: draft.name?.trim() || current.name,
            content: draft.content ?? current.content,
            description:
              draft.description === undefined
                ? current.description
                : draft.description || null,
            folder:
              draft.folder === undefined
                ? current.folder
                : draft.folder || null,
            order: draft.order ?? current.order,
            updatedAt: now(),
          })
          .where(eq(snippets.id, id))
          .returning()
          .get();
        touched(snippets);
        return snippetFromRow(row);
      },
      async remove(id) {
        (await db()).delete(snippets).where(eq(snippets.id, id)).run();
        touched(snippets);
      },
      async reorder(items) {
        const d = await db();
        d.transaction((tx) => {
          for (const item of items) {
            tx.update(snippets)
              .set({
                order: item.order,
                ...(item.folder !== undefined
                  ? { folder: item.folder || null }
                  : {}),
                updatedAt: now(),
              })
              .where(eq(snippets.id, item.id))
              .run();
          }
        });
        touched(snippets);
      },
    },

    snippetFolders: {
      subscribe: watch(snippetFolders, snippets),
      async list() {
        return (await db())
          .select()
          .from(snippetFolders)
          .orderBy(asc(snippetFolders.name))
          .all()
          .map(snippetFolderFromRow);
      },
      async create(folder) {
        const name = folder.name.trim();
        if (!name) throw new AppError("Name is required", "VALIDATION_ERROR");
        const d = await db();
        const exists = d
          .select()
          .from(snippetFolders)
          .where(eq(snippetFolders.name, name))
          .get();
        if (exists) {
          throw new AppError("A folder with that name exists", "CONFLICT");
        }
        d.insert(snippetFolders)
          .values({
            syncId: randomUUID(),
            name,
            color: folder.color ?? null,
            icon: folder.icon ?? null,
          })
          .run();
        touched(snippetFolders);
      },
      async rename(oldName, newName) {
        const name = newName.trim();
        if (!name) throw new AppError("Name is required", "VALIDATION_ERROR");
        const d = await db();
        d.transaction((tx) => {
          tx.update(snippetFolders)
            .set({ name, updatedAt: now() })
            .where(eq(snippetFolders.name, oldName))
            .run();
          tx.update(snippets)
            .set({ folder: name, updatedAt: now() })
            .where(eq(snippets.folder, oldName))
            .run();
        });
        touched(snippetFolders, snippets);
      },
      async remove(name) {
        const d = await db();
        d.transaction((tx) => {
          tx.delete(snippetFolders).where(eq(snippetFolders.name, name)).run();
          tx.update(snippets)
            .set({ folder: null, updatedAt: now() })
            .where(eq(snippets.folder, name))
            .run();
        });
        touched(snippetFolders, snippets);
      },
    },

    commandHistory: {
      async list(host) {
        return (await db())
          .select({ command: commandHistory.command })
          .from(commandHistory)
          .where(eq(commandHistory.hostSyncId, hostKey(host)))
          .orderBy(desc(commandHistory.usedAt), desc(commandHistory.id))
          .limit(HISTORY_LIMIT)
          .all()
          .map((row) => row.command);
      },
      async add(host, command) {
        const text = command.trim();
        if (!text) return;
        const d = await db();
        const key = hostKey(host);
        d.transaction((tx) => {
          tx.insert(commandHistory)
            .values({ hostSyncId: key, command: text, usedAt: now() })
            .onConflictDoUpdate({
              target: [commandHistory.hostSyncId, commandHistory.command],
              set: { usedAt: now() },
            })
            .run();
          const keep = tx
            .select({ id: commandHistory.id })
            .from(commandHistory)
            .where(eq(commandHistory.hostSyncId, key))
            .orderBy(desc(commandHistory.usedAt), desc(commandHistory.id))
            .limit(HISTORY_LIMIT)
            .all()
            .map((row) => row.id);
          tx.delete(commandHistory)
            .where(
              and(
                eq(commandHistory.hostSyncId, key),
                notInArray(commandHistory.id, keep),
              ),
            )
            .run();
        });
      },
      async remove(host, command) {
        (await db())
          .delete(commandHistory)
          .where(
            and(
              eq(commandHistory.hostSyncId, hostKey(host)),
              eq(commandHistory.command, command),
            ),
          )
          .run();
      },
      async clear(host) {
        (await db())
          .delete(commandHistory)
          .where(eq(commandHistory.hostSyncId, hostKey(host)))
          .run();
      },
    },

    recentActivity: {
      subscribe: watch(recentActivity),
      async list(limit = 20) {
        return (await db())
          .select()
          .from(recentActivity)
          .orderBy(desc(recentActivity.at), desc(recentActivity.id))
          .limit(limit)
          .all()
          .map((row) => ({
            kind: row.kind,
            title: row.title,
            hostSyncId: row.hostSyncId,
            at: row.at,
          }));
      },
      async add(entry) {
        const d = await db();
        d.transaction((tx) => {
          tx.insert(recentActivity)
            .values({
              kind: entry.kind,
              title: entry.title,
              hostSyncId: entry.hostSyncId ?? null,
              at: now(),
            })
            .run();
          const keep = tx
            .select({ id: recentActivity.id })
            .from(recentActivity)
            .orderBy(desc(recentActivity.at), desc(recentActivity.id))
            .limit(ACTIVITY_LIMIT)
            .all()
            .map((row) => row.id);
          tx.delete(recentActivity)
            .where(notInArray(recentActivity.id, keep))
            .run();
        });
        touched(recentActivity);
      },
    },
  };
}

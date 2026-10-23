import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { accounts } from "@/core/accounts";
import { isServerAccount } from "@/core/accounts/types";
import { hosts } from "@/core/db/schema";
import { localStores, type LocalStores } from "@/core/db/stores";
import { SyncRemote } from "./remote";

/**
 * A linked server's own id for a host. The phone's copy has its own ids, but
 * server actions (the relay terminal, files, docker, ...) need the server's.
 * Shared hosts carry it; owned ones are asked for once and kept on the row.
 * See the Plugin-Sync issue about a batch lookup.
 */
export async function serverHostId(
  accountId: string,
  host: { id: number; syncId?: string | null; serverId?: number | null },
  stores: LocalStores = localStores,
): Promise<number> {
  if (typeof host.serverId === "number") return host.serverId;
  const account = accounts.find(accountId);
  if (!isServerAccount(account) || !account.options.sync || !host.syncId) {
    return host.id;
  }
  const { db } = await stores.openForSync(accountId);
  const row = db
    .select({ serverId: hosts.serverId })
    .from(hosts)
    .where(eq(hosts.syncId, host.syncId))
    .get();
  if (typeof row?.serverId === "number") return row.serverId;
  const client = accounts.client(accountId);
  if (!client) return host.id;
  const id = await new SyncRemote(client).hostId(host.syncId);
  if (id === null) return host.id;
  db.update(hosts)
    .set({ serverId: id })
    .where(eq(hosts.syncId, host.syncId))
    .run();
  return id;
}

/** The host with the server's id, for code that talks to the server. */
export async function asServerHost<
  T extends { id: number; syncId?: string | null; serverId?: number | null },
>(accountId: string, host: T, stores?: LocalStores): Promise<T> {
  const id = await serverHostId(accountId, host, stores);
  return id === host.id ? host : { ...host, id, localId: host.id };
}

/** Asks for the server ids of up to `limit` owned hosts that lack one. */
export async function fillServerIds(
  accountId: string,
  limit = 50,
  stores: LocalStores = localStores,
): Promise<number> {
  const client = accounts.client(accountId);
  if (!client) return 0;
  const { db } = await stores.openForSync(accountId);
  const missing = db
    .select({ syncId: hosts.syncId })
    .from(hosts)
    .where(and(isNull(hosts.serverId), isNull(hosts.sharedSource)))
    .limit(limit)
    .all();
  const remote = new SyncRemote(client);
  let filled = 0;
  for (let i = 0; i < missing.length; i += 4) {
    const batch = missing.slice(i, i + 4);
    const ids = await Promise.all(
      batch.map((row) => remote.hostId(row.syncId).catch(() => null)),
    );
    batch.forEach((row, index) => {
      const id = ids[index];
      if (id === null) return;
      db.update(hosts)
        .set({ serverId: id })
        .where(and(eq(hosts.syncId, row.syncId), isNotNull(hosts.syncId)))
        .run();
      filled++;
    });
  }
  return filled;
}

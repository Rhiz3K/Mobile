import { drizzle } from "drizzle-orm/expo-sqlite";
import {
  addDatabaseChangeListener,
  deleteDatabaseSync,
  openDatabaseSync,
} from "expo-sqlite";
import { AppError } from "@/core/errors";
import type { DbDriver, SqlValue } from "./driver";
import * as schema from "./schema";

/** expo-sqlite built with SQLCipher (app.json `useSQLCipher`). */
export const expoDriver: DbDriver | null = {
  open(name, keyHex) {
    const sqlite = openDatabaseSync(name, { enableChangeListener: true });
    try {
      // Raw key form, so SQLCipher skips its own key derivation.
      sqlite.execSync(`PRAGMA key = "x'${keyHex}'"`);
      // PRAGMA key does nothing without SQLCipher, so prove it is there.
      const cipher = sqlite.getFirstSync<{ cipher_version: string }>(
        "PRAGMA cipher_version",
      );
      if (!cipher?.cipher_version) {
        throw new AppError(
          "This build can't encrypt local data.",
          "DB_NOT_ENCRYPTED",
        );
      }
      sqlite.execSync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    } catch (error) {
      sqlite.closeSync();
      throw error;
    }
    return {
      db: drizzle(sqlite, { schema }),
      path: sqlite.databasePath,
      raw: {
        exec: (sql) => sqlite.execSync(sql),
        get: <T>(sql: string) => sqlite.getFirstSync<T>(sql) ?? undefined,
        all: <T>(sql: string, params: SqlValue[] = []) =>
          sqlite.getAllSync<T>(sql, params),
        run: (sql, params = []) => {
          sqlite.runSync(sql, params);
        },
        transaction: (fn) => sqlite.withTransactionSync(fn),
        close: () => sqlite.closeSync(),
      },
    };
  },
  remove(name) {
    deleteDatabaseSync(name);
  },
  onChange(listener) {
    const sub = addDatabaseChangeListener((event) =>
      listener(event.databaseName, event.tableName),
    );
    return () => sub.remove();
  },
};

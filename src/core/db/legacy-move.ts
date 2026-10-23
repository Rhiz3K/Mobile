import * as SecureStore from "expo-secure-store";
import { SECRET_KEYS } from "@/core/api/AccountClient";
import { DEVICE_ONLY, plainStore, type JsonKV } from "@/core/storage/kv";

export const MOVED_FLAG = "localStore.moved.v1";

// 1.x kept its login token in AsyncStorage. The account move takes it when a
// server was set up; anything left after that is stale and must go.
const STRAY_PLAIN_KEYS = ["jwt", "serverConfig", "server"];

const APP_LOCK_PIN = "appLockPin";

interface MoveDeps {
  kv?: JsonKV;
  accountIds: string[];
}

const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

/**
 * Runs once per install, after accounts load. 1.x never kept hosts, logins or
 * snippets on the phone, so there is nothing to copy into the database. What
 * it does: deletes plain text tokens 1.x left behind, and saves every Keychain
 * item again as device only, since items made before 2.0 could go into iCloud
 * Keychain and phone backups. Device UI settings stay where they are.
 */
export async function moveLegacyData(deps: MoveDeps): Promise<boolean> {
  const kv = deps.kv ?? plainStore;
  if (await kv.get(MOVED_FLAG)) return false;

  await Promise.all(
    STRAY_PLAIN_KEYS.map((key) => kv.remove(key).catch(() => {})),
  );

  const secure = [
    APP_LOCK_PIN,
    ...deps.accountIds.flatMap((id) =>
      SECRET_KEYS.map((name) => `acct.${id}.${name}`),
    ),
  ].map(secureKey);

  for (const key of secure) {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value == null) continue;
      // An update keeps the old access setting, so delete and add again.
      await SecureStore.deleteItemAsync(key);
      await SecureStore.setItemAsync(key, value, DEVICE_ONLY);
    } catch {}
  }

  await kv.set(MOVED_FLAG, "1");
  return true;
}

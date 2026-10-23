import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/** Small async key value store. Every account gets its own namespace. */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface JsonKV extends KV {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown): Promise<void>;
}

function withJson(kv: KV): JsonKV {
  return {
    ...kv,
    async getJson<T>(key: string) {
      const raw = await kv.get(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJson: (key, value) => kv.set(key, JSON.stringify(value)),
  };
}

/** Plain storage for data that is not secret (caches, lists, flags). */
export const plainStore: JsonKV = withJson({
  async get(key) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    await AsyncStorage.setItem(key, value);
  },
  async remove(key) {
    await AsyncStorage.removeItem(key);
  },
});

/**
 * Keychain items stay on this phone: never in iCloud Keychain or a phone
 * backup. Android Keystore keys never leave the device anyway.
 */
export const DEVICE_ONLY: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// SecureStore keys only allow letters, digits, ".", "-" and "_".
const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

/** Keychain or Keystore backed storage for tokens, passwords and certificates. */
export const secureStore: JsonKV = withJson({
  async get(key) {
    try {
      return await SecureStore.getItemAsync(secureKey(key), DEVICE_ONLY);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    await SecureStore.setItemAsync(secureKey(key), value, DEVICE_ONLY);
  },
  async remove(key) {
    await SecureStore.deleteItemAsync(secureKey(key), DEVICE_ONLY);
  },
});

/** Prefixes every key, so two accounts never read each other's data. */
export function namespaced(kv: JsonKV, prefix: string): JsonKV {
  const k = (key: string) => `${prefix}.${key}`;
  return withJson({
    get: (key) => kv.get(k(key)),
    set: (key, value) => kv.set(k(key), value),
    remove: (key) => kv.remove(k(key)),
  });
}

export interface AccountStorage {
  /** Non secret data for this account. */
  data: JsonKV;
  /** Secret data for this account. */
  secrets: JsonKV;
  /** Keys written so far, so removing an account can wipe them. */
  wipe(keys: { data: string[]; secrets: string[] }): Promise<void>;
}

export function accountStorage(accountId: string): AccountStorage {
  const data = namespaced(plainStore, `acct.${accountId}`);
  const secrets = namespaced(secureStore, `acct.${accountId}`);
  return {
    data,
    secrets,
    async wipe(keys) {
      await Promise.all([
        ...keys.data.map((key) => data.remove(key).catch(() => {})),
        ...keys.secrets.map((key) => secrets.remove(key).catch(() => {})),
      ]);
    },
  };
}

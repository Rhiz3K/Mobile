import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { DEVICE_ONLY as options } from "@/core/storage/kv";

const keyName = (accountId: string) =>
  `db.key.${accountId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The account's database key, made on first use. 32 random bytes as hex. */
export async function getDbKey(accountId: string): Promise<string> {
  const name = keyName(accountId);
  const existing = await SecureStore.getItemAsync(name, options);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(name, key, options);
  return key;
}

export async function deleteDbKey(accountId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyName(accountId), options).catch(
    () => {},
  );
}

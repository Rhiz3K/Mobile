import fs from "node:fs";
import { eq } from "drizzle-orm";
import { hosts } from "@/core/db/schema";
import { LocalStores } from "@/core/db/stores";
import { changes } from "@/core/db/changes";
import { resetStorage } from "../../helpers/http";
import { testDriver, testStores } from "../../helpers/db";

beforeEach(resetStorage);

const host = (name: string) => ({
  syncId: name,
  name,
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  authType: "password",
});

test("nothing opens until App Lock unlocks", async () => {
  const driver = testDriver();
  const stores = new LocalStores(driver);
  await expect(stores.get("local")).rejects.toMatchObject({
    code: "APP_LOCKED",
  });
  expect(driver.keys.size).toBe(0);
  stores.unlock();
  await stores.get("local");
  expect(driver.keys.get("termix-local.db")).toMatch(/^[0-9a-f]{64}$/);
});

test("locking closes files and refuses reads", async () => {
  const { stores } = testStores();
  await stores.get("local");
  stores.lock();
  expect(stores.isOpen("local")).toBe(false);
  await expect(stores.get("local")).rejects.toMatchObject({
    code: "APP_LOCKED",
  });
});

test("each account has its own file and key", async () => {
  const { stores, driver } = testStores();
  const a = await stores.get("local");
  const b = await stores.get("srv1");
  a.db.insert(hosts).values(host("one")).run();
  expect(b.db.select().from(hosts).all()).toEqual([]);
  expect(driver.keys.get("termix-local.db")).not.toBe(
    driver.keys.get("termix-srv1.db"),
  );
});

test("the same account opens once even when asked twice at once", async () => {
  const { stores, driver } = testStores();
  const open = jest.spyOn(driver, "open");
  const [a, b] = await Promise.all([stores.get("local"), stores.get("local")]);
  expect(a).toBe(b);
  expect(open).toHaveBeenCalledTimes(1);
});

test("wipe deletes the file and the key, and the next open is empty", async () => {
  const { stores, driver } = testStores();
  const first = await stores.get("local");
  first.db.insert(hosts).values(host("one")).run();
  const oldKey = driver.keys.get("termix-local.db");
  const listener = jest.fn();
  const stop = changes.subscribe("local", ["ssh_data"], listener);

  await stores.wipe("local");
  expect(fs.existsSync(driver.file("termix-local.db"))).toBe(false);
  expect(listener).toHaveBeenCalled();
  stop();

  const again = await stores.get("local");
  expect(
    again.db.select().from(hosts).where(eq(hosts.syncId, "one")).all(),
  ).toEqual([]);
  expect(driver.keys.get("termix-local.db")).not.toBe(oldKey);
});

test("no driver means no local store", async () => {
  const stores = new LocalStores(null);
  stores.unlock();
  expect(stores.getState()).toEqual({ available: false, unlocked: false });
  await expect(stores.get("local")).rejects.toMatchObject({
    code: "NO_LOCAL_STORE",
  });
});

test("native change events reach the right account", async () => {
  let emit: (name: string, table: string) => void = () => {};
  const driver = {
    ...testDriver(),
    onChange: (listener: typeof emit) => {
      emit = listener;
      return () => {};
    },
  };
  const stores = new LocalStores(driver);
  stores.unlock();
  await stores.get("local");
  const listener = jest.fn();
  changes.subscribe("local", ["ssh_data"], listener);
  emit("/data/SQLite/termix-local.db", "ssh_data");
  emit("/data/SQLite/termix-other.db", "ssh_data");
  expect(listener).toHaveBeenCalledTimes(1);
});

test("file names only use safe characters", () => {
  expect(LocalStores.fileName("a/b..c")).toBe("termix-a_b__c.db");
});

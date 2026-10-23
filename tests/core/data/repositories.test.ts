import { AccountClient } from "@/core/api/AccountClient";
import {
  emptyRepositories,
  repositoriesFor,
  serverRepositories,
} from "@/core/data/repositories";
import { localStores } from "@/core/db/stores";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../helpers/http";
import { testDriver } from "../../helpers/db";

beforeEach(async () => {
  await resetStorage();
  localStores.setDriver(testDriver());
  localStores.unlock();
});

test("This device saves into its encrypted store", async () => {
  const repos = repositoriesFor({ id: "local", kind: "local" }, null);
  expect(repos.source).toBe("local");
  expect(await repos.hosts.list()).toEqual([]);
  await repos.snippets.create({ name: "up", content: "uptime" });
  expect((await repos.snippets.list()).map((s) => s.name)).toEqual(["up"]);
  expect(repositoriesFor({ id: "local", kind: "local" }, null)).toBe(repos);
});

test("with no store (web) reads are empty and writes refuse", async () => {
  localStores.setDriver(null);
  const repos = repositoriesFor({ id: "local", kind: "local" }, null);
  expect(repos).toBe(emptyRepositories);
  expect(await repos.hosts.list()).toEqual([]);
  await expect(repos.credentials.create({})).rejects.toMatchObject({
    code: "NO_LOCAL_STORE",
  });
});

test("linked servers read through the account client and signal writes", async () => {
  const seen = fakeServer((req) =>
    req.url.endsWith("/credentials")
      ? { data: { credentials: [{ id: 1, name: "root key" }] } }
      : { data: { id: 2, name: "new" } },
  );
  const client = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  const repos = repositoriesFor({ id: "a", kind: "server" } as any, client);
  expect(repos.source).toBe("server");
  expect(await repos.credentials.list()).toEqual([{ id: 1, name: "root key" }]);

  const changed = jest.fn();
  repos.credentials.subscribe(changed);
  await repos.credentials.create({ name: "new" });
  expect(changed).toHaveBeenCalledTimes(1);

  await repos.snippets.list();
  expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
    "GET https://t.example/credentials",
    "POST https://t.example/credentials",
    "GET https://t.example/snippets",
  ]);
  expect(repositoriesFor({ id: "a", kind: "server" } as any, client)).toBe(
    repos,
  );
});

test("a server keeps a host's origin, or the phone does when it can't", async () => {
  let refuse = false;
  const seen = fakeServer((req) =>
    req.method === "PUT" && refuse
      ? { status: 400, data: { error: "connectFrom is not declared" } }
      : { data: {} },
  );
  const client = new AccountClient({
    accountId: "b",
    serverUrl: "https://t.example",
    storage: accountStorage("b"),
  });
  client.apiGeneration = "plugin";
  const repos = repositoriesFor({ id: "b", kind: "server" } as any, client);
  const changed = jest.fn();
  repos.hosts.subscribe(changed);

  await repos.origins.set(4, "device");
  const put = seen.find((r) => r.method === "PUT")!;
  expect(put.url).toBe(
    "https://t.example/plugins/ssh-terminal/settings/host/4",
  );
  expect(put.data).toEqual({ connectFrom: "device" });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(await repos.origins.get({ id: 4 })).toBe("device");
  expect(await accountStorage("b").data.getJson("hostOrigins")).toEqual({});

  // An older ssh-terminal refuses the key; the phone keeps the choice.
  refuse = true;
  await repos.origins.set(5, "server");
  expect(await accountStorage("b").data.getJson("hostOrigins")).toEqual({
    "5": "server",
  });
  expect(await repos.origins.get({ id: 5 })).toBe("server");

  // Another repos instance (after a restart) reads the phone copy, and the
  // server's own value wins when the host carries one.
  const fresh = serverRepositories(client, accountStorage("b").data);
  expect(await fresh.origins.get({ id: 5 })).toBe("server");
  expect(await fresh.origins.get({ id: 6, connectFrom: "auto" })).toBe("auto");
  expect(await fresh.origins.get({ id: 7 })).toBeUndefined();
});

test("with no store an origin can't be saved", async () => {
  localStores.setDriver(null);
  const repos = repositoriesFor({ id: "local", kind: "local" }, null);
  expect(await repos.origins.get({ id: 1 })).toBeUndefined();
  await expect(repos.origins.set(1, "auto")).rejects.toMatchObject({
    code: "NO_LOCAL_STORE",
  });
});

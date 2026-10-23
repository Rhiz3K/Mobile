import { AccountClient } from "@/core/api/AccountClient";
import { emptyRepositories, repositoriesFor } from "@/core/data/repositories";
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

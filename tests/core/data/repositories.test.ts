import { AccountClient } from "@/core/api/AccountClient";
import { AppError } from "@/core/errors";
import { repositoriesFor } from "@/core/data/repositories";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

test("This device starts empty and refuses writes for now", async () => {
  const repos = repositoriesFor({ id: "local", kind: "local" }, null);
  expect(await repos.hosts.list()).toEqual([]);
  expect(await repos.snippets.list()).toEqual([]);
  await expect(repos.credentials.create({})).rejects.toBeInstanceOf(AppError);
});

test("linked servers read through the account client", async () => {
  const seen = fakeServer((req) =>
    req.url.endsWith("/credentials")
      ? { data: { credentials: [{ id: 1, name: "root key" }] } }
      : { data: [] },
  );
  const client = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  const repos = repositoriesFor({ id: "a", kind: "server" } as any, client);
  expect(await repos.credentials.list()).toEqual([{ id: 1, name: "root key" }]);
  await repos.snippets.list();
  expect(seen.map((r) => r.url)).toEqual([
    "https://t.example/credentials",
    "https://t.example/snippets",
  ]);
});

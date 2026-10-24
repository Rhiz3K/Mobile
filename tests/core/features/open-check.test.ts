import { checkOpen } from "@/core/features/open-check";
import { features } from "@/core/features/registry";
import { localStores } from "@/core/db/stores";
import { localRepositories } from "@/core/data/local";
import { registerBuiltInFeatures } from "@/features";
import { resetStorage } from "../../helpers/http";
import { testDriver } from "../../helpers/db";

jest.mock("@/modules/termix-ssh", () => ({
  ...jest.requireActual("@/modules/termix-ssh"),
  isSshEngineAvailable: true,
}));

beforeAll(() => registerBuiltInFeatures());

beforeEach(async () => {
  await resetStorage();
  localStores.setDriver(testDriver());
  localStores.unlock();
});

test("a This device host opens a terminal from the phone", async () => {
  const check = await checkOpen("local", { id: 1 }, true, "terminal");
  expect(check.blocked).toBeUndefined();
  expect(check.attempts.map((t) => t.kind)).toEqual(["local"]);
});

test("server features on a This device host say what they need", async () => {
  const check = await checkOpen("local", { id: 1 }, true, "docker");
  expect(check.attempts).toEqual([]);
  expect(check.blocked?.reason).toMatch(/Docker needs a Termix server/);
  expect(check.blocked?.fix).toBeUndefined();
});

test("files on a This device host open over the phone's SFTP", async () => {
  const check = await checkOpen("local", { id: 1 }, true, "filemanager");
  expect(check.blocked).toBeUndefined();
  expect(check.attempts.map((t) => t.kind)).toEqual(["local"]);
});

test("the saved origin is read from the account's store", async () => {
  const repos = localRepositories("local");
  const host = await repos.hosts.create({
    name: "b",
    ip: "b.lan",
    port: 22,
    username: "u",
    authType: "password",
  } as never);
  await repos.origins.set(host.id, "server");
  // This device ignores it: it has no server to go through.
  const check = await checkOpen("local", host, true, "terminal");
  expect(check.plan.origin).toBe("device");
  expect(features.sessionNeeds("terminal")).toEqual([["shell"]]);
});

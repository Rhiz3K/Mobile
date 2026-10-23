import { localRepositories, HISTORY_LIMIT } from "@/core/data/local";
import { hosts as hostsTable } from "@/core/db/schema";
import type { SSHHost, SSHHostData } from "@/types";
import { resetStorage } from "../../helpers/http";
import { testStores } from "../../helpers/db";

beforeEach(resetStorage);

function setup() {
  const { stores } = testStores();
  return { stores, repos: localRepositories("local", stores) };
}

const fullHost: SSHHostData = {
  name: "web",
  ip: "10.0.0.5",
  port: 2222,
  username: "deploy",
  folder: "Prod / Web",
  tags: ["prod", "web"],
  pin: true,
  authType: "password",
  password: "hunter2",
  enableTerminal: true,
  enableTunnel: true,
  enableFileManager: true,
  enableDocker: true,
  defaultPath: "/srv",
  tunnelConnections: [
    {
      sourcePort: 8080,
      endpointPort: 80,
      endpointHost: "db",
      maxRetries: 3,
      retryInterval: 10,
      autoStart: false,
    } as never,
  ],
  jumpHosts: [{ hostId: 7 }],
  statsConfig: JSON.stringify({
    enabledWidgets: ["cpu"],
    metricsEnabled: true,
    metricsInterval: 30,
  }),
  forceKeyboardInteractive: true,
  overrideCredentialUsername: false,
  notes: "main box",
  macAddress: "aa:bb:cc:dd:ee:ff",
  enableSsh: true,
  enableRdp: true,
  enableVnc: true,
  enableTelnet: true,
  rdpUser: "admin",
  rdpPassword: "rdp-pass",
  rdpDomain: "CORP",
  rdpPort: 3390,
  vncUser: "v",
  vncPassword: "vnc-pass",
  vncPort: 5901,
  telnetUser: "t",
  telnetPassword: "tel-pass",
  telnetPort: 2323,
};

test("a host keeps every field across save and load", async () => {
  const { repos } = setup();
  const saved = await repos.hosts.create(fullHost);
  const [loaded] = await repos.hosts.list();
  expect(loaded).toEqual(saved);
  expect(loaded.syncId).toMatch(/^[0-9a-f-]{36}$/);
  expect(loaded).toMatchObject({
    name: "web",
    ip: "10.0.0.5",
    port: 2222,
    username: "deploy",
    folder: "Prod / Web",
    tags: ["prod", "web"],
    pin: true,
    authType: "password",
    password: "hunter2",
    enableTerminal: true,
    enableTunnel: true,
    enableFileManager: true,
    enableDocker: true,
    defaultPath: "/srv",
    jumpHosts: [{ hostId: 7 }],
    forceKeyboardInteractive: true,
    notes: "main box",
    macAddress: "aa:bb:cc:dd:ee:ff",
    enableSsh: true,
    enableRdp: true,
    enableVnc: true,
    enableTelnet: true,
    rdpUser: "admin",
    rdpPassword: "rdp-pass",
    rdpDomain: "CORP",
    rdpPort: 3390,
    vncUser: "v",
    vncPassword: "vnc-pass",
    vncPort: 5901,
    telnetUser: "t",
    telnetPassword: "tel-pass",
    telnetPort: 2323,
  } satisfies Partial<SSHHost>);
  expect(loaded.tunnelConnections).toHaveLength(1);
  expect(JSON.parse(loaded.statsConfig!)).toMatchObject({
    enabledWidgets: ["cpu"],
    metricsEnabled: true,
    metricsInterval: 30,
  });
});

test("rows use the server's wire shape", async () => {
  const { repos, stores } = setup();
  await repos.hosts.create(fullHost);
  const { db } = await stores.get("local");
  const [row] = db.select().from(hostsTable).all();
  expect(row.tags).toBe("prod,web");
  expect(row.forceKeyboardInteractive).toBe("true");
  expect(JSON.parse(row.pluginSettings!)).toMatchObject({
    "ssh-terminal": { enableTerminal: true },
    "file-manager": { enableFileManager: true, defaultPath: "/srv" },
    docker: { enableDocker: true },
    tunnels: { enableTunnel: true },
    "remote-desktop": { enableRdp: true, rdpPort: 3390 },
    "wake-on-lan": { macAddress: "aa:bb:cc:dd:ee:ff" },
    "host-metrics": { metricsEnabled: true, metricsInterval: 30 },
  });
  expect(JSON.parse(row.protocolAuth!)).toEqual({
    rdp: {
      authType: "direct",
      username: "admin",
      password: "rdp-pass",
      fields: { domain: "CORP" },
      credentialId: null,
    },
    vnc: {
      authType: "direct",
      username: "v",
      password: "vnc-pass",
      fields: {},
      credentialId: null,
    },
    telnet: {
      authType: "direct",
      username: "t",
      password: "tel-pass",
      fields: {},
      credentialId: null,
    },
  });
});

test("an update keeps secrets it was not given and clears other auth types", async () => {
  const { repos } = setup();
  const host = await repos.hosts.create(fullHost);
  const kept = await repos.hosts.update(host.id, {
    ...fullHost,
    password: undefined,
    rdpPassword: undefined,
    enableVnc: false,
  });
  expect(kept.password).toBe("hunter2");
  expect(kept.rdpPassword).toBe("rdp-pass");
  expect(kept.vncPassword).toBeUndefined();
  expect(kept.syncId).toBe(host.syncId);

  const cred = await repos.credentials.create({
    name: "key",
    authType: "key",
    username: "root",
    key: "PRIVATE",
  });
  const switched = await repos.hosts.update(host.id, {
    ...fullHost,
    authType: "credential",
    credentialId: cred.id,
  });
  expect(switched.password).toBeUndefined();
  expect(switched.credentialId).toBe(cred.id);

  await repos.credentials.remove(cred.id);
  expect((await repos.hosts.get(host.id))?.credentialId).toBeUndefined();
});

test("missing rows give a clear error", async () => {
  const { repos } = setup();
  await expect(repos.hosts.update(99, fullHost)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await repos.hosts.get(99)).toBeNull();
});

test("credentials round trip and keep secrets on update", async () => {
  const { repos } = setup();
  const cred = await repos.credentials.create({
    name: "deploy key",
    authType: "key",
    username: "deploy",
    key: "PRIVATE",
    publicKey: "ssh-ed25519 AAA",
    keyPassword: "pp",
    tags: ["a", "b"],
  });
  expect(cred).toMatchObject({
    name: "deploy key",
    key: "PRIVATE",
    publicKey: "ssh-ed25519 AAA",
    keyPassword: "pp",
    tags: ["a", "b"],
    usageCount: 0,
  });
  const renamed = await repos.credentials.update(cred.id, { name: "renamed" });
  expect(renamed).toMatchObject({ name: "renamed", key: "PRIVATE" });
  await expect(repos.credentials.create({ name: " " })).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
});

test("snippets, folders, rename and reorder", async () => {
  const { repos } = setup();
  await repos.snippetFolders.create({ name: "ops" });
  await expect(
    repos.snippetFolders.create({ name: "ops" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const a = await repos.snippets.create({
    name: "uptime",
    content: "uptime",
    folder: "ops",
  });
  const b = await repos.snippets.create({ name: "df", content: "df -h" });
  await repos.snippets.reorder([
    { id: b.id, order: 0 },
    { id: a.id, order: 1, folder: "ops" },
  ]);
  expect((await repos.snippets.list()).map((s) => s.name)).toEqual([
    "df",
    "uptime",
  ]);

  await repos.snippetFolders.rename("ops", "admin");
  expect((await repos.snippets.get(a.id))?.folder).toBe("admin");
  expect((await repos.snippetFolders.list()).map((f) => f.name)).toEqual([
    "admin",
  ]);

  await repos.snippetFolders.remove("admin");
  expect((await repos.snippets.get(a.id))?.folder).toBeNull();
  expect(await repos.snippetFolders.list()).toEqual([]);

  const edited = await repos.snippets.update(b.id, { content: "df -H" });
  expect(edited).toMatchObject({ name: "df", content: "df -H" });
  await repos.snippets.remove(b.id);
  expect(await repos.snippets.get(b.id)).toBeNull();
});

test("command history is per host, newest first, no repeats, capped", async () => {
  const { repos } = setup();
  const host = await repos.hosts.create(fullHost);
  const other = await repos.hosts.create({ ...fullHost, name: "other" });
  const now = jest.spyOn(Date.prototype, "toISOString");
  let tick = 0;
  // Every write gets a later time, so order is exact.
  now.mockImplementation(
    () => `2026-01-01T00:00:${String(tick++).padStart(6, "0")}Z`,
  );

  await repos.commandHistory.add(host, "ls");
  await repos.commandHistory.add(host, "pwd");
  await repos.commandHistory.add(host, "ls");
  await repos.commandHistory.add(host, "  ");
  await repos.commandHistory.add(other, "whoami");
  expect(await repos.commandHistory.list(host)).toEqual(["ls", "pwd"]);

  await repos.commandHistory.remove(host, "ls");
  expect(await repos.commandHistory.list(host)).toEqual(["pwd"]);

  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    await repos.commandHistory.add(host, `cmd ${i}`);
  }
  const list = await repos.commandHistory.list(host);
  expect(list).toHaveLength(HISTORY_LIMIT);
  expect(list[0]).toBe(`cmd ${HISTORY_LIMIT + 4}`);

  await repos.commandHistory.clear(host);
  expect(await repos.commandHistory.list(host)).toEqual([]);
  expect(await repos.commandHistory.list(other)).toEqual(["whoami"]);
  now.mockRestore();
});

test("recent activity keeps the newest entries", async () => {
  const { repos } = setup();
  await repos.recentActivity.add({ kind: "terminal", title: "web" });
  await repos.recentActivity.add({ kind: "files", title: "db" });
  const list = await repos.recentActivity.list();
  expect(list.map((e) => e.title)).toEqual(
    expect.arrayContaining(["web", "db"]),
  );
});

test("writes tell subscribers, other accounts stay quiet", async () => {
  const { stores, repos } = setup();
  const other = localRepositories("srv", stores);
  const mine = jest.fn();
  const theirs = jest.fn();
  repos.hosts.subscribe(mine);
  other.hosts.subscribe(theirs);
  const host = await repos.hosts.create(fullHost);
  await repos.hosts.remove(host.id);
  expect(mine).toHaveBeenCalledTimes(2);
  expect(theirs).not.toHaveBeenCalled();
  expect(await other.hosts.list()).toEqual([]);
});

test("everything waits for App Lock", async () => {
  const { stores, repos } = setup();
  stores.lock();
  await expect(repos.hosts.list()).rejects.toMatchObject({
    code: "APP_LOCKED",
  });
});

test("lists hear about an unlock, so a read made while locked can retry", async () => {
  const { stores, repos } = setup();
  stores.lock();
  const listener = jest.fn();
  repos.hosts.subscribe(listener);
  stores.lock();
  expect(listener).not.toHaveBeenCalled();
  stores.unlock();
  expect(listener).toHaveBeenCalledTimes(1);
});

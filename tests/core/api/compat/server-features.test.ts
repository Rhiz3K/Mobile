import { AccountClient } from "@/core/api/AccountClient";
import { activePlugins } from "@/core/api/compat/server-features";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

async function client(
  generation: "legacy" | "plugin",
  plugins: unknown[] | null,
) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", generation);
  if (plugins) await c.storage.data.setJson("enabledPlugins", plugins);
  await c.load();
  return c;
}

test("only enabled and running plugins count", () => {
  const plugins = activePlugins([
    { id: "ssh-terminal", enabled: true, state: "active" },
    { id: "docker", enabled: false, state: "disabled" },
    { id: "tunnels", enabled: true, state: "failed" },
    { id: "snippets" },
    { name: "no id" },
  ])!;
  expect(plugins.map((p) => p.id)).toEqual(["ssh-terminal", "snippets"]);
});

test("cached lists survive a JSON round trip", () => {
  const plugins = activePlugins([
    {
      id: "remote-desktop",
      enabled: true,
      state: "active",
      contributes: { protocols: [{ id: "rdp" }] },
    },
  ]);
  expect(activePlugins(JSON.parse(JSON.stringify(plugins)))).toEqual([
    { id: "remote-desktop", protocols: ["rdp"] },
  ]);
  expect(activePlugins("nope")).toBeNull();
});

test("older servers and an unknown plugin list keep everything on", async () => {
  const legacy = await client("legacy", null);
  expect(legacy.supports({ plugin: "docker" })).toBe(true);
  const unknown = await client("plugin", null);
  expect(unknown.supports({ plugin: "docker" })).toBe(true);
});

test("plugins that are off are not supported", async () => {
  const c = await client("plugin", [{ id: "ssh-terminal" }]);
  expect(c.supports({ plugin: "ssh-terminal" })).toBe(true);
  expect(c.supports({ plugin: "docker" })).toBe(false);
});

test("protocol plugins follow their declared protocols", async () => {
  const c = await client("plugin", [
    { id: "remote-desktop", protocols: ["rdp", "vnc"] },
  ]);
  expect(c.supports({ plugin: "remote-desktop", protocol: "rdp" })).toBe(true);
  expect(c.supports({ plugin: "remote-desktop", protocol: "vnc" })).toBe(true);
  expect(c.supports({ plugin: "remote-desktop", protocol: "telnet" })).toBe(
    false,
  );
  await resetStorage();
  const noList = await client("plugin", [{ id: "remote-desktop" }]);
  expect(
    noList.supports({ plugin: "remote-desktop", protocol: "telnet" }),
  ).toBe(true);
});

test("plugin only features are off on older servers", async () => {
  const legacy = await client("legacy", null);
  expect(legacy.supports({ plugin: "tailscale", pluginApiOnly: true })).toBe(
    false,
  );
  const on = await client("plugin", [{ id: "tailscale" }]);
  expect(on.supports({ plugin: "tailscale", pluginApiOnly: true })).toBe(true);
});

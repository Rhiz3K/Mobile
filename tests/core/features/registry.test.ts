import { AccountClient } from "@/core/api/AccountClient";
import { FeatureRegistry } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

const local = {
  account: { id: "local", kind: "local" } as const,
  client: null,
};

async function serverCtx(plugins: unknown[] | null, generation = "plugin") {
  const client = new AccountClient({
    accountId: "s",
    serverUrl: "https://t.example",
    storage: accountStorage("s"),
  });
  await client.storage.data.set("apiGeneration", generation);
  if (plugins) await client.storage.data.setJson("enabledPlugins", plugins);
  await client.load();
  return { account: { id: "s", kind: "server" } as any, client };
}

const Dummy = () => null;

function feature(id: string, extra: Partial<FeatureDef> = {}): FeatureDef {
  return { id, title: id, source: "native", ...extra };
}

test("register returns an unregister, and ids are unique", () => {
  const r = new FeatureRegistry();
  const listener = jest.fn();
  r.subscribe(listener);
  const off = r.register(feature("a"));
  expect(() => r.register(feature("a"))).toThrow(/already registered/);
  expect(r.all()).toHaveLength(1);
  off();
  expect(r.all()).toHaveLength(0);
  expect(listener).toHaveBeenCalledTimes(2);
});

test("server features need their plugin, local ones need availableOn", async () => {
  const r = new FeatureRegistry();
  r.register(feature("needs-docker", { requires: { plugin: "docker" } }));
  r.register(feature("everywhere", { availableOn: ["local", "server"] }));
  r.register(feature("server-only"));

  expect(r.available(local).map((d) => d.id)).toEqual(["everywhere"]);
  const off = await serverCtx([{ id: "ssh-terminal" }]);
  expect(r.available(off).map((d) => d.id)).toEqual([
    "everywhere",
    "server-only",
  ]);
  await resetStorage();
  const on = await serverCtx([{ id: "docker" }]);
  expect(r.available(on).map((d) => d.id)).toContain("needs-docker");
});

test("contributions are merged across features and sorted", async () => {
  const r = new FeatureRegistry();
  const action = (id: string, order: number) => ({
    id,
    label: id,
    icon: Dummy,
    group: "connect" as const,
    order,
    isAvailable: () => true,
    run: () => {},
  });
  r.register(feature("a", { hostActions: [action("late", 50)] }));
  r.register(
    feature("b", {
      hostActions: [action("early", 10)],
      requires: { plugin: "b" },
    }),
  );
  const ctx = await serverCtx(null, "legacy");
  expect(r.hostActions(ctx).map((a) => a.id)).toEqual(["early", "late"]);
});

test("session tabs are found by local and server type, and gated per protocol", async () => {
  const r = new FeatureRegistry();
  r.register(
    feature("rd", {
      requires: { plugin: "rd" },
      sessionTabs: [
        {
          type: "remote",
          icon: Dummy,
          titleSuffix: () => "",
          shortLabel: () => "",
          serverTabTypes: ["rdp", "vnc"],
          toServerTabType: (s) => s.remoteProtocol ?? "rdp",
          fromServerTabType: (t) => ({ remoteProtocol: t }),
          requires: (s) => ({ plugin: "rd", protocol: s.remoteProtocol }),
          capabilities: ["own-keyboard"],
          component: Dummy,
        },
      ],
    }),
  );
  expect(r.sessionTab("remote")).not.toBeNull();
  expect(r.sessionTabForServerType("vnc")?.opts).toEqual({
    remoteProtocol: "vnc",
  });
  expect(r.sessionTabForServerType("files")).toBeNull();
  expect(r.sessionHas("remote", "own-keyboard")).toBe(true);
  expect(r.sessionHas("remote", "terminal-input")).toBe(false);

  const ctx = await serverCtx([{ id: "rd", protocols: ["rdp"] }]);
  expect(r.canOpen("remote", { remoteProtocol: "rdp" }, ctx)).toBe(true);
  expect(r.canOpen("remote", { remoteProtocol: "vnc" }, ctx)).toBe(false);
  expect(r.canOpen("remote", {}, local)).toBe(false);
  expect(r.canOpen("missing", {}, ctx)).toBe(false);
});

test("capabilities come from available features only", async () => {
  const r = new FeatureRegistry();
  r.register(
    feature("wol", {
      requires: { plugin: "wake-on-lan" },
      capabilities: ["host.wake"],
    }),
  );
  const off = await serverCtx([]);
  expect(r.hasCapability("host.wake", off)).toBe(false);
  await resetStorage();
  const on = await serverCtx([{ id: "wake-on-lan" }]);
  expect(r.hasCapability("host.wake", on)).toBe(true);
});

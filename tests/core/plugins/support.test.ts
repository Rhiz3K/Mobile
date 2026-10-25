import type { ServerPlugin } from "@/core/api/compat/server-features";
import { FeatureRegistry } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import { describeSupport, supportRows } from "@/core/plugins/support";

function registry(...defs: FeatureDef[]) {
  const r = new FeatureRegistry();
  for (const def of defs) r.register(def);
  return r;
}

function feature(id: string, extra: Partial<FeatureDef> = {}): FeatureDef {
  return { id, title: id, source: "native", ...extra };
}

const docker = feature("docker", {
  plugins: ["docker"],
  availableOn: ["local", "server"],
});
const totp = feature("totp", {
  plugins: ["totp"],
  requires: { plugin: "totp" },
});
const defaults = feature("host-defaults", {
  title: "Host defaults",
  availableOn: ["local", "server"],
});

const plugin = (id: string, extra: Partial<ServerPlugin> = {}) => ({
  id,
  active: true,
  ...extra,
});

function row(rows: ReturnType<typeof supportRows>, id: string) {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

test("This device: phone features work, the rest needs a server", () => {
  const rows = supportRows({
    registry: registry(docker, totp, defaults),
    local: true,
    plugins: null,
  });
  expect(row(rows, "docker")).toMatchObject({
    mode: "native",
    onDevice: true,
    server: "none",
    section: "phone",
    status: "Works on this phone",
  });
  expect(row(rows, "totp")).toMatchObject({
    onDevice: false,
    section: "server",
    status: "Link a server to use it",
  });
  expect(row(rows, "sso")).toMatchObject({ mode: "server", section: "server" });
  expect(row(rows, "host-status")).toMatchObject({
    mode: "app",
    onDevice: true,
  });
  expect(row(rows, "classic-themes")).toMatchObject({
    mode: "look",
    section: "absent",
    status: "The app has its own look",
  });
  expect(row(rows, "host-defaults")).toMatchObject({
    name: "Host defaults",
    section: "phone",
  });
  // Sorted by name.
  const names = rows.map((r) => r.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test("a server account shows each plugin's state there", () => {
  const rows = supportRows({
    registry: registry(docker, totp),
    local: false,
    plugins: [
      plugin("docker", { active: false }),
      plugin("totp"),
      plugin("sso"),
    ],
  });
  expect(row(rows, "docker").status).toBe("Phone only | off on this server");
  expect(row(rows, "totp").status).toBe("Through the server");
  expect(row(rows, "sso").status).toBe("Runs on the server");
  expect(row(rows, "ldap").status).toBe("Not on this server");
});

test("a server that has not said keeps everything reachable", () => {
  const rows = supportRows({
    registry: registry(docker, totp),
    local: false,
    plugins: null,
  });
  expect(row(rows, "docker").status).toBe("Phone and server");
  expect(row(rows, "totp").status).toBe("Through the server");
});

test("a plugin's own mobile info fills in what the app has no screen for", () => {
  const rows = supportRows({
    registry: registry(docker),
    local: false,
    plugins: [
      plugin("databases", {
        name: "DB Browser",
        mobile: { mode: "webview", note: "Best on a tablet" },
      }),
      plugin("docker", { mobile: { mode: "none" } }),
      plugin("community-thing", { mobile: { mode: "native" } }),
      plugin("quiet-thing"),
      plugin("off-thing", { active: false }),
      plugin("labelled", { mobile: { mode: "webview", note: "mobile.note" } }),
    ],
  });
  expect(row(rows, "databases")).toMatchObject({
    name: "DB Browser",
    mode: "webview",
    section: "server",
    note: "Best on a tablet",
  });
  // The app's own screens win over the manifest.
  expect(row(rows, "docker").mode).toBe("native");
  expect(row(rows, "community-thing")).toMatchObject({
    needsNewerApp: true,
    status: "Needs a newer version of the app",
  });
  expect(row(rows, "quiet-thing").status).toBe(
    "Not in the app yet | on this server",
  );
  expect(rows.some((r) => r.id === "off-thing")).toBe(false);
  // A locale key needs the plugin's strings, so it is not shown.
  expect(row(rows, "labelled").note).toBeUndefined();
});

test("describeSupport covers the plain cases", () => {
  const base = { mode: "native" as const, onDevice: true };
  expect(describeSupport({ ...base, server: "missing" })).toBe(
    "Phone only | not on this server",
  );
  expect(
    describeSupport({ mode: "webview", onDevice: false, server: "missing" }),
  ).toBe("Not on this server");
  expect(
    describeSupport({ mode: "none", onDevice: false, server: "none" }),
  ).toBe("Not in the app yet");
});

import {
  activePlugins,
  filterOptionAvailable,
  hasServerFeature,
  pluginForFeature,
  sessionFeature,
  type ServerFeature,
} from "@/core/api/compat/server-features";

const ALL: ServerFeature[] = [
  "terminal",
  "commandHistory",
  "fileManager",
  "tunnels",
  "metrics",
  "docker",
  "rdp",
  "vnc",
  "telnet",
  "snippets",
  "wakeOnLan",
  "alerts",
  "totp",
  "tailscale",
  "importExport",
  "credentialTools",
];

test("older servers and an unknown plugin list keep everything on", () => {
  for (const feature of ALL) {
    expect(hasServerFeature(feature, false, [])).toBe(true);
    expect(hasServerFeature(feature, true, null)).toBe(true);
  }
});

test("only enabled and running plugins count", () => {
  const plugins = activePlugins([
    { id: "ssh-terminal", enabled: true, state: "active" },
    { id: "docker", enabled: false, state: "disabled" },
    { id: "tunnels", enabled: true, state: "failed" },
    { id: "snippets" },
    { name: "no id" },
  ])!;
  expect(plugins.map((p) => p.id)).toEqual(["ssh-terminal", "snippets"]);
  const has = (f: ServerFeature) => hasServerFeature(f, true, plugins);
  expect(has("terminal")).toBe(true);
  expect(has("commandHistory")).toBe(true);
  expect(has("snippets")).toBe(true);
  expect(has("docker")).toBe(false);
  expect(has("tunnels")).toBe(false);
  expect(has("fileManager")).toBe(false);
  expect(has("rdp")).toBe(false);
});

test("Tailscale discovery follows the Tailscale plugin", () => {
  expect(pluginForFeature("tailscale")).toBe("tailscale");
  for (const entry of [
    { id: "tailscale", enabled: false, state: "disabled" },
    { id: "tailscale", enabled: true, state: "failed" },
  ]) {
    expect(hasServerFeature("tailscale", true, activePlugins([entry]))).toBe(
      false,
    );
  }
  expect(hasServerFeature("tailscale", true, [])).toBe(false);
  expect(
    hasServerFeature(
      "tailscale",
      true,
      activePlugins([{ id: "tailscale", enabled: true, state: "active" }]),
    ),
  ).toBe(true);
});

test("remote desktop protocols follow the plugin's declared protocols", () => {
  const plugins = activePlugins([
    {
      id: "remote-desktop",
      enabled: true,
      state: "active",
      contributes: { protocols: [{ id: "rdp" }, { id: "vnc" }] },
    },
  ]);
  const has = (f: ServerFeature) => hasServerFeature(f, true, plugins);
  expect(has("rdp")).toBe(true);
  expect(has("vnc")).toBe(true);
  expect(has("telnet")).toBe(false);

  const noList = activePlugins([
    { id: "remote-desktop", enabled: true, state: "active", contributes: {} },
  ]);
  expect(hasServerFeature("telnet", true, noList)).toBe(true);
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
  const again = activePlugins(JSON.parse(JSON.stringify(plugins)));
  expect(hasServerFeature("rdp", true, again)).toBe(true);
  expect(hasServerFeature("vnc", true, again)).toBe(false);
  expect(activePlugins("nope")).toBeNull();
});

test("host filters only offer features the server has", () => {
  const has = (f: ServerFeature) => f !== "docker" && f !== "vnc";
  expect(filterOptionAvailable("docker", has)).toBe(false);
  expect(filterOptionAvailable("vnc", has)).toBe(false);
  expect(filterOptionAvailable("tunnel", has)).toBe(true);
  expect(filterOptionAvailable("ssh", has)).toBe(true);
  expect(filterOptionAvailable("online", has)).toBe(true);
});

test("session tabs map to the feature they need", () => {
  expect(sessionFeature("terminal")).toBe("terminal");
  expect(sessionFeature("stats")).toBe("metrics");
  expect(sessionFeature("filemanager")).toBe("fileManager");
  expect(sessionFeature("tunnel")).toBe("tunnels");
  expect(sessionFeature("docker")).toBe("docker");
  expect(sessionFeature("remoteDesktop", "vnc")).toBe("vnc");
  expect(sessionFeature("remoteDesktop", "telnet")).toBe("telnet");
  expect(sessionFeature("remoteDesktop", "ssh")).toBe("rdp");
  expect(sessionFeature("remoteDesktop")).toBe("rdp");
  expect(sessionFeature("unknown")).toBeNull();
});

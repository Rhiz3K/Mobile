const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const tailscale = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../src/features/tailscale/tailscale.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: tailscale },
);

// Values created inside the VM have different prototypes from Node's realm.
const plain = (value) => JSON.parse(JSON.stringify(value));
const device = {
  id: "device-1",
  hostname: "build-server",
  name: "build-server.example.ts.net",
  addresses: ["fd7a:115c:a1e0::1", "100.76.12.1"],
  os: "linux",
  lastSeen: "2026-10-20T12:00:00Z",
};

test("address selection prefers the first Tailscale IPv4 address", () => {
  assert.equal(tailscale.tailnetAddress(device), "100.76.12.1");
  assert.equal(
    tailscale.tailnetAddress({
      ...device,
      addresses: ["100.76.12.2", "100.76.12.3"],
    }),
    "100.76.12.2",
  );
  assert.equal(
    tailscale.tailnetAddress({ ...device, addresses: ["fd7a:115c:a1e0::1"] }),
    "fd7a:115c:a1e0::1",
  );
  assert.equal(tailscale.tailnetAddress({ ...device, addresses: [] }), "");
});

test("device filtering searches hostname, name, OS, and every address", () => {
  const devices = [device, { ...device, id: "device-2", hostname: "laptop" }];
  for (const query of [
    " BUILD-SERVER ",
    "EXAMPLE.TS.NET",
    "LiNuX",
    "76.12",
    "FD7A",
  ]) {
    assert.ok(tailscale.filterTailscaleDevices(devices, query).length > 0);
  }
  assert.deepEqual(
    tailscale
      .filterTailscaleDevices(devices, "laptop")
      .map((entry) => entry.id),
    ["device-2"],
  );
  assert.equal(tailscale.filterTailscaleDevices(devices, "missing").length, 0);
  assert.equal(tailscale.filterTailscaleDevices(devices, " \n "), devices);
});

test("a host draft uses Tailscale SSH and includes no secrets", () => {
  assert.deepEqual(plain(tailscale.tailscaleHostDraft(device, "  alice  ")), {
    name: "build-server",
    ip: "100.76.12.1",
    port: 22,
    username: "alice",
    authType: "tailscale",
  });
  const draft = tailscale.tailscaleHostDraft(
    { ...device, hostname: "", password: "secret", apiKey: "secret" },
    " \t ",
  );
  assert.equal(draft.name, device.name);
  assert.equal(draft.username, "root");
  assert.deepEqual(Object.keys(draft).sort(), [
    "authType",
    "ip",
    "name",
    "port",
    "username",
  ]);
});

test("successful responses normalize devices and strip unrelated fields", () => {
  assert.deepEqual(
    plain(
      tailscale.parseTailscaleDevicesResponse({
        devices: [{ ...device, apiKey: "secret" }],
        hasApiKey: true,
        apiKey: "secret",
      }),
    ),
    { devices: [device], hasApiKey: true },
  );
  assert.deepEqual(
    plain(
      tailscale.parseTailscaleDevicesResponse({
        devices: [
          null,
          "bad",
          {},
          { id: "partial", addresses: ["100.1.2.3", 42, null], lastSeen: null },
        ],
        hasApiKey: true,
      }),
    ),
    {
      devices: [
        {
          id: "partial",
          name: "",
          hostname: "",
          addresses: ["100.1.2.3"],
          os: "",
          lastSeen: "",
        },
      ],
      hasApiKey: true,
    },
  );
});

test("API-key and upstream error response bodies retain their actionable error", () => {
  for (const body of [
    { devices: [], hasApiKey: false },
    { devices: [], hasApiKey: true, error: "Invalid API key" },
    { devices: [], hasApiKey: true, error: "Tailscale API unavailable" },
    {
      devices: [],
      hasApiKey: false,
      error: "Unable to read Tailscale configuration",
    },
  ]) {
    assert.deepEqual(
      plain(tailscale.parseTailscaleDevicesResponse(body)),
      body,
    );
  }
});

test("unknown response shapes are rejected", () => {
  for (const body of [
    null,
    undefined,
    [],
    "offline",
    {},
    { devices: [] },
    { devices: [], hasApiKey: "true" },
    { devices: null, hasApiKey: true },
    { devices: [], hasApiKey: true, error: { message: "failed" } },
  ]) {
    assert.equal(tailscale.parseTailscaleDevicesResponse(body), null);
  }
});

const apiSource = ts.createSourceFile(
  "main-axios.ts",
  fs.readFileSync(
    path.join(__dirname, "../src/core/api/main-axios.ts"),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const apiFunctions = [
  "getTailscaleDevices",
  "isTailscaleAvailable",
  "isPluginApi",
  "hasFeature",
  "getRootBase",
  "isHtmlPayload",
].map((name) => {
  const declaration = apiSource.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(declaration, `${name} must exist`);
  return declaration.getText(apiSource);
});

const features = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../src/core/api/compat/server-features.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: features },
);

function apiFixture({
  serverUrl = "https://termix.example/base/ssh/",
  generation = "plugin",
  plugins = [{ id: "tailscale" }],
  request = async () => ({ data: { devices: [], hasApiKey: true } }),
} = {}) {
  const api = {};
  const requests = [];
  vm.runInNewContext(
    ts.transpileModule(apiFunctions.join("\n"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports: api,
      apiGeneration: generation,
      enabledPlugins: plugins,
      configuredServerUrl: serverUrl,
      hasServerFeature: features.hasServerFeature,
      parseTailscaleDevicesResponse: tailscale.parseTailscaleDevicesResponse,
      axios: { isAxiosError: (error) => error?.isAxiosError === true },
      authApi: {
        get: async (url, options) => {
          requests.push({ url, ...options });
          return request();
        },
      },
    },
  );
  return { api, requests };
}

function rejectResponse(status, data) {
  const error = Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
  return {
    error,
    request: async () => {
      throw error;
    },
  };
}

test("discovery calls the plugin endpoint at the configured server root", async () => {
  for (const [serverUrl, baseURL] of [
    ["https://termix.example/base/ssh/", "https://termix.example/base"],
    ["https://termix.example/base/", "https://termix.example/base"],
    [null, "http://localhost:8081"],
  ]) {
    const f = apiFixture({
      serverUrl,
      request: async () => ({ data: { devices: [device], hasApiKey: true } }),
    });
    assert.deepEqual(plain(await f.api.getTailscaleDevices()), {
      devices: [device],
      hasApiKey: true,
    });
    assert.deepEqual(f.requests, [
      { url: "/plugin-api/tailscale/devices", baseURL },
    ]);
  }
});

test("discovery returns normalized API-key and upstream HTTP errors", async () => {
  for (const status of [401, 500, 502]) {
    const body = {
      devices: [],
      hasApiKey: status !== 500,
      error: `Failure ${status}`,
    };
    const f = apiFixture(rejectResponse(status, { ...body, apiKey: "secret" }));
    assert.deepEqual(plain(await f.api.getTailscaleDevices()), body);
  }
});

test("discovery identifies missing device permissions without exposing devices", async () => {
  for (const data of [
    {
      devices: [device],
      hasApiKey: true,
      error: "Missing tailscale.devices.view permission",
    },
    { error: "Missing tailscale.devices.view permission" },
  ]) {
    const f = apiFixture(rejectResponse(403, data));
    assert.deepEqual(plain(await f.api.getTailscaleDevices()), {
      devices: [],
      hasApiKey: data.hasApiKey ?? false,
      error: "forbidden",
    });
  }
});

test("discovery treats a missing plugin and unknown success payloads as unavailable", async () => {
  for (const [status, data] of [
    [404, { devices: [], hasApiKey: true, error: "Route not found" }],
    [500, "<!doctype html><html>Termix</html>"],
  ]) {
    assert.equal(
      await apiFixture(rejectResponse(status, data)).api.getTailscaleDevices(),
      null,
    );
  }
  for (const data of [
    "<!doctype html><html>Termix</html>",
    { message: "ok" },
  ]) {
    const f = apiFixture({ request: async () => ({ data }) });
    assert.equal(await f.api.getTailscaleDevices(), null);
  }
});

test("discovery preserves transport and unrecognized HTTP failures", async () => {
  const transport = new Error("Network unavailable");
  for (const failure of [
    {
      error: transport,
      request: async () => {
        throw transport;
      },
    },
    rejectResponse(502, { message: "Bad gateway" }),
  ]) {
    const f = apiFixture(failure);
    await assert.rejects(
      f.api.getTailscaleDevices(),
      (error) => error === failure.error,
    );
  }
});

test("discovery availability requires a plugin server with Tailscale enabled", () => {
  for (const [generation, plugins, expected] of [
    ["legacy", [{ id: "tailscale" }], false],
    ["legacy", null, false],
    ["plugin", [], false],
    ["plugin", [{ id: "ssh-terminal" }], false],
    ["plugin", [{ id: "tailscale" }], true],
    ["plugin", null, true],
  ]) {
    const f = apiFixture({ generation, plugins });
    assert.equal(f.api.isTailscaleAvailable(), expected);
    assert.equal(f.requests.length, 0);
  }
});

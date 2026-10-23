import { AccountClient } from "@/core/api/AccountClient";
import { ApiError } from "@/core/api/errors";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

function client(id = "a1", serverUrl = "https://termix.example/") {
  return new AccountClient({
    accountId: id,
    serverUrl,
    storage: accountStorage(id),
  });
}

test("sends the account's token, proxy headers and user agent", async () => {
  const seen = fakeServer(() => ({ data: { username: "luke" } }));
  const c = client();
  await c.setToken("tok-1");
  await c.setProxy({ customHeaders: [{ name: "X-Proxy", value: "yes" }] });
  await c.api.auth.getUserInfo();
  expect(seen[0].url).toBe("https://termix.example/users/me");
  expect(seen[0].headers.Authorization).toBe("Bearer tok-1");
  expect(seen[0].headers["X-Proxy"]).toBe("yes");
  expect(String(seen[0].headers["User-Agent"])).toMatch(/^Termix-Mobile\//);
});

test("two accounts never share a token", async () => {
  const seen = fakeServer(() => ({ data: {} }));
  const a = client("a", "https://one.example");
  const b = client("b", "https://two.example");
  await a.setToken("token-a");
  await b.setToken("token-b");
  await a.api.auth.getUserInfo();
  await b.api.auth.getUserInfo();
  expect(seen.map((r) => [r.url, r.headers.Authorization])).toEqual([
    ["https://one.example/users/me", "Bearer token-a"],
    ["https://two.example/users/me", "Bearer token-b"],
  ]);
});

test("the token survives a restart through secure storage", async () => {
  const first = client();
  await first.setToken("kept");
  const second = client();
  await second.load();
  expect(second.token()).toBe("kept");
  expect(second.isAuthenticated()).toBe(true);
});

test("a 401 on a critical endpoint signs the account out", async () => {
  fakeServer(() => ({ status: 401, data: { error: "expired" } }));
  const c = client();
  await c.setToken("old");
  const lost = jest.fn();
  c.onAuthLost(lost);
  await expect(c.api.auth.getUserInfo()).rejects.toBeInstanceOf(ApiError);
  expect(lost).toHaveBeenCalledTimes(1);
  expect(c.token()).toBeNull();
});

test("detects a 2.9 server and rewrites old paths to plugin routes", async () => {
  const seen = fakeServer((req) => {
    if (req.url.endsWith("/plugins/public-manifest")) return { data: {} };
    if (req.url.endsWith("/plugins")) {
      return { data: [{ id: "snippets", enabled: true, state: "active" }] };
    }
    return { data: [] };
  });
  const c = client();
  await c.setToken("t");
  await c.refreshServerApi();
  expect(c.isPluginApi()).toBe(true);
  expect(c.hasFeature("snippets")).toBe(true);
  expect(c.hasFeature("docker")).toBe(false);
  await c.api.snippets.getSnippets();
  expect(seen[seen.length - 1].url).toBe(
    "https://termix.example/plugin-api/snippets",
  );
});

test("a server that answers the manifest with HTML is pre 2.9", async () => {
  fakeServer((req) =>
    req.url.endsWith("/plugins/public-manifest")
      ? { data: "<!doctype html><html></html>" }
      : { data: { version: "2.8.0" } },
  );
  const c = client();
  await c.refreshServerApi();
  expect(c.isPluginApi()).toBe(false);
  // Older servers have every feature built in.
  expect(c.hasFeature("docker")).toBe(true);
});

test("the cached generation and plugin list load before the network", async () => {
  fakeServer((req) =>
    req.url.endsWith("/plugins")
      ? { data: [{ id: "docker", enabled: true, state: "active" }] }
      : { data: {} },
  );
  const first = client();
  await first.refreshServerApi();
  const again = client();
  await again.load();
  expect(again.isPluginApi()).toBe(true);
  expect(again.isPluginEnabled("docker")).toBe(true);
  expect(again.isPluginEnabled("tunnels")).toBe(false);
});

test("socket URLs follow the server generation", async () => {
  fakeServer(() => ({ data: {} }));
  const c = client("a", "https://termix.example/ssh");
  expect(c.terminalWebSocketUrl("t")).toBe(
    "wss://termix.example/ssh/websocket/?token=t",
  );
  expect(c.remoteDesktopWebSocketUrl("t", 10, 20)).toBe(
    "wss://termix.example/guacamole/websocket/?token=t&width=10&height=20",
  );
  await c.refreshServerApi();
  expect(c.terminalWebSocketUrl("t")).toBe(
    "wss://termix.example/plugin-ws/ssh-terminal/terminal",
  );
  expect(c.dockerConsoleWebSocketUrl("t")).toBe(
    "wss://termix.example/plugin-ws/docker/console",
  );
});

test("the client certificate is kept but not used yet", async () => {
  const c = client();
  await c.setClientCert({ pfx: "AAAA", passphrase: "pw", name: "me.p12" });
  const again = client();
  await again.load();
  expect(again.clientCert()).toEqual({
    pfx: "AAAA",
    passphrase: "pw",
    name: "me.p12",
  });
});

test("wipe removes every saved secret", async () => {
  const c = client();
  await c.setToken("t");
  await c.setClientCert({ pfx: "A", passphrase: "", name: null });
  await c.wipe();
  const again = client();
  await again.load();
  expect(again.token()).toBeNull();
  expect(again.clientCert()).toBeNull();
});

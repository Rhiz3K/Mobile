import { AccountClient } from "@/core/api/AccountClient";
import { ApiError } from "@/core/api/errors";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../helpers/http";
import { clearFakeNet, fakeNet } from "../../helpers/net";

beforeEach(resetStorage);
afterEach(clearFakeNet);

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
  expect(c.supports({ plugin: "snippets" })).toBe(true);
  expect(c.supports({ plugin: "docker" })).toBe(false);
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
  expect(c.supports({ plugin: "docker" })).toBe(true);
  expect(c.supports({ plugin: "tailscale", pluginApiOnly: true })).toBe(false);
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

test("a client certificate goes to the native store, not to secure storage", async () => {
  const net = fakeNet();
  const c = client();
  const info = await c.setClientCert({
    base64: "AAAA",
    passphrase: "pw",
    name: "me.p12",
  });
  expect(info).toEqual({ name: "me.p12", subject: "CN=phone", notAfter: null });
  expect(net.certs.get("a1")).toBe("termix.example");
  const again = client();
  await again.load();
  expect(again.clientCert()).toEqual(info);
  expect(
    JSON.stringify(await again.storage.secrets.getJson("clientCert")),
  ).not.toContain("AAAA");
});

test("a certificate saved by an older build is ignored", async () => {
  await accountStorage("a1").secrets.setJson("clientCert", {
    pfx: "A",
    passphrase: "",
    name: null,
  });
  const c = client();
  await c.load();
  expect(c.clientCert()).toBeNull();
});

test("basic auth is sent, and the session moves to the jwt cookie", async () => {
  const seen = fakeServer(() => ({ data: {} }));
  const c = client();
  await c.setToken("tok");
  await c.setProxy({ basicAuth: { username: "u", password: "p" } });
  await c.api.auth.getUserInfo();
  expect(seen[0].headers.Authorization).toBe("Basic dTpw");
  expect(seen[0].headers.Cookie).toBe("jwt=tok");
});

test("proxy cookies never keep a jwt cookie and go back in the jar on load", async () => {
  const net = fakeNet();
  const c = client();
  await c.setProxyCookies([
    { name: "CF_Authorization", value: "cf" },
    { name: "jwt", value: "old" },
  ]);
  expect(c.proxyCookies()).toEqual([{ name: "CF_Authorization", value: "cf" }]);
  net.cookies.clear();
  const again = client();
  await again.load();
  expect(net.cookies.get("https://termix.example")).toEqual([
    { name: "CF_Authorization", value: "cf" },
  ]);
});

test("a new token clears the login cookie the server would read first", async () => {
  const net = fakeNet();
  const c = client();
  await c.setToken("device");
  expect(net.cleared).toEqual([["https://termix.example", "jwt"]]);
  await c.setToken("device");
  expect(net.cleared).toHaveLength(1);
});

test("on iOS with a certificate, requests go through the native module", async () => {
  const net = fakeNet({ nativeRequests: true });
  net.reply = () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "luke" }),
    url: "",
  });
  fakeServer(() => ({ data: { username: "wrong path" } }));
  const c = client();
  await c.setToken("tok");
  await c.setClientCert({ base64: "AAAA", passphrase: "pw", name: null });
  expect(c.usesNativeNetwork()).toBe(true);
  const me = await c.api.auth.getUserInfo();
  expect(me.username).toBe("luke");
  expect(net.requests[0].url).toBe("https://termix.example/users/me");
  expect(net.requests[0].headers.Authorization).toBe("Bearer tok");
});

test("wipe removes every saved secret and the certificate", async () => {
  const net = fakeNet();
  const c = client();
  await c.setToken("t");
  await c.setClientCert({ base64: "A", passphrase: "", name: null });
  await c.wipe();
  const again = client();
  await again.load();
  expect(again.token()).toBeNull();
  expect(again.clientCert()).toBeNull();
  expect(net.certs.size).toBe(0);
});

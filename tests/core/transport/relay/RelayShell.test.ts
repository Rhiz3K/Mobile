import { buildTerminalWebSocketUrl } from "@/core/api/compat/api-compat";
import { RelayShell } from "@/core/transport/relay/RelayShell";

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onclose?: (e: { code: number }) => void;
  onmessage?: (e: { data: string }) => void;
  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeSocket.all.push(this);
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
}

const realWebSocket = global.WebSocket;
beforeEach(() => {
  FakeSocket.all = [];
  (global as any).WebSocket = FakeSocket;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  (global as any).WebSocket = realWebSocket;
});

function fakeClient(
  serverUrl = "https://termix.example/base/",
  token: string | null = "header.payload.signature",
  generation: "legacy" | "plugin" = "legacy",
) {
  return {
    serverUrl,
    token: () => token,
    terminalWebSocketUrl: (jwt: string) =>
      buildTerminalWebSocketUrl(serverUrl, jwt, generation),
    openSocket: (url: string, protocols: string[]) =>
      new (global as any).WebSocket(url, protocols),
  };
}

function manager(client = fakeClient(), callbacks: Record<string, any> = {}) {
  const errors: string[] = [];
  const m = new RelayShell({
    client,
    hostConfig: { id: 1, name: "host" } as any,
    onStateChange: () => {},
    onConnectionFailed: (message: string) => errors.push(message),
    ...callbacks,
  } as any);
  return { m, errors };
}

function expectAuthenticated(
  socket: FakeSocket,
  token = "header.payload.signature",
  generation: "legacy" | "plugin" = "legacy",
) {
  expect(Array.from(socket.protocols ?? [])).toEqual([`termix.jwt.${token}`]);
  const url = new URL(socket.url);
  if (generation === "plugin") {
    // 2.9 only reads the subprotocol, so the token stays out of the URL.
    expect(url.searchParams.get("token")).toBeNull();
    expect(url.pathname).toBe("/base/plugin-ws/ssh-terminal/terminal");
    return;
  }
  // Older servers only accept the URL token.
  expect(url.searchParams.get("token")).toBe(token);
  expect(url.pathname).toBe("/base/ssh/websocket/");
}

test("sends the auth subprotocol on the first connect", async () => {
  const { m } = manager();
  await m.connect(80, 24);
  expect(FakeSocket.all).toHaveLength(1);
  expectAuthenticated(FakeSocket.all[0]);
  m.destroy();
  expect(jest.getTimerCount()).toBe(0);
});

test("keeps the auth subprotocol on automatic reconnect", async () => {
  const { m } = manager();
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.close();
  socket.onclose?.({ code: 1006 });
  jest.advanceTimersByTime(1000);
  expect(FakeSocket.all.length).toBeGreaterThanOrEqual(2);
  expectAuthenticated(FakeSocket.all[1]);
  m.destroy();
  expect(jest.getTimerCount()).toBe(0);
});

test("2.9 servers get the plugin terminal socket", async () => {
  const { m } = manager(
    fakeClient(
      "https://termix.example/base/",
      "header.payload.signature",
      "plugin",
    ),
  );
  await m.connect(80, 24);
  expectAuthenticated(FakeSocket.all[0], "header.payload.signature", "plugin");
  m.destroy();
});

test("a saved /ssh suffix does not double the socket path", async () => {
  const { m } = manager(fakeClient("https://termix.example/ssh"));
  await m.connect(80, 24);
  expect(new URL(FakeSocket.all[0].url).pathname).toBe("/ssh/websocket/");
  m.destroy();
});

test("browser SSH checks open and complete without writing terminal data", async () => {
  const required: { url: string; message: string }[] = [];
  const data: string[] = [];
  let completed = 0;
  const { m, errors } = manager(fakeClient(), {
    onBrowserCheckRequired: (url: string, message: string) =>
      required.push({ url, message }),
    onBrowserCheckCompleted: () => completed++,
    onData: (value: string) => data.push(value),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  expect(jest.getTimerCount()).toBe(1);
  socket.onmessage?.({
    data: JSON.stringify({
      type: "tailscale_check_required",
      url: "https://login.tailscale.com/a/check",
      message: "Complete your SSH check to continue.",
    }),
  });
  expect(required).toEqual([
    {
      url: "https://login.tailscale.com/a/check",
      message: "Complete your SSH check to continue.",
    },
  ]);
  // Browser checks clear the connection timeout.
  expect(jest.getTimerCount()).toBe(0);
  socket.onmessage?.({
    data: JSON.stringify({ type: "tailscale_check_completed" }),
  });
  expect(completed).toBe(1);
  expect(data).toEqual([]);
  expect(errors).toEqual([]);
  m.destroy();
});

test("Warpgate authentication still requires its explicit continuation", async () => {
  const required: { url: string; securityKey: string }[] = [];
  const checks: string[] = [];
  const { m } = manager(fakeClient(), {
    onWarpgateAuthRequired: (url: string, securityKey: string) =>
      required.push({ url, securityKey }),
    onBrowserCheckRequired: (url: string) => checks.push(url),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.readyState = 1;
  socket.onmessage?.({
    data: JSON.stringify({
      type: "warpgate_auth_required",
      url: "https://warpgate.example/auth",
      securityKey: "123456",
    }),
  });
  expect(required).toEqual([
    { url: "https://warpgate.example/auth", securityKey: "123456" },
  ]);
  expect(checks).toEqual([]);
  expect(socket.sent).toEqual([]);
  m.sendWarpgateContinue();
  expect(socket.sent).toEqual([{ type: "warpgate_auth_continue", data: {} }]);
  m.destroy();
});

test.each([null, "", "   "])(
  "missing or blank credentials do not open sockets: %p",
  async (token) => {
    const { m, errors } = manager(
      fakeClient("https://termix.example/base/", token),
    );
    await m.connect(80, 24);
    expect(FakeSocket.all).toHaveLength(0);
    expect(errors).toHaveLength(1);
    m.destroy();
  },
);

test("failures say which step failed, using the server's last error", async () => {
  const failures: any[] = [];
  const { m } = manager(fakeClient(), {
    onConnectionFailed: (_m: string, f: unknown) => failures.push(f),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.readyState = FakeSocket.OPEN;
  (socket as any).onopen?.();
  socket.onmessage?.({
    data: JSON.stringify({
      type: "error",
      message: "connect ECONNREFUSED 10.0.0.5:22",
    }),
  });
  socket.onclose?.({ code: 1000 });
  expect(failures).toEqual([
    expect.objectContaining({
      stage: "network",
      message: "connect ECONNREFUSED 10.0.0.5:22",
      origin: "relay",
    }),
  ]);
  m.destroy();

  const signedOut: any[] = [];
  const out = manager(fakeClient("https://termix.example/", null), {
    onConnectionFailed: (_m: string, f: unknown) => signedOut.push(f),
  });
  await out.m.connect(80, 24);
  expect(signedOut[0]).toMatchObject({ stage: "server", origin: "relay" });
});

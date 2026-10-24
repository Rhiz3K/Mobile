import { act, renderHook } from "@testing-library/react-native";
import { useFileBackend } from "@/features/file-manager/connection/useFileBackend";
import { SshError } from "@/modules/termix-ssh";

const mockCheckOpen = jest.fn();
jest.mock("@/core/features/open-check", () => ({
  checkOpen: (...args: unknown[]) => mockCheckOpen(...args),
}));
jest.mock("@/core/sync", () => ({
  isSynced: () => true,
  asServerHost: async (_a: string, host: any) => ({ ...host, id: 99 }),
}));
jest.mock("@/core/accounts/session", () => ({
  useSessionAccountId: () => "s",
}));

beforeEach(() => mockCheckOpen.mockReset());

const host = {
  id: 1,
  name: "web",
  ip: "10.0.0.2",
  port: 22,
  username: "u",
} as any;

function local(openSession: jest.Mock) {
  return {
    kind: "local",
    provides: ["sftp"],
    available: true,
    openSession,
  } as any;
}
const relay = { kind: "relay", provides: ["server"], available: true } as any;

function sessionWithHome(home: string) {
  return {
    exec: jest.fn(),
    close: jest.fn(async () => {}),
    sftp: { realpath: jest.fn(async () => home) },
  };
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

test("connects over the phone's SFTP when the plan says so", async () => {
  const open = jest.fn(async () => sessionWithHome("/home/u"));
  mockCheckOpen.mockResolvedValue({ attempts: [local(open)] });
  const { result } = await renderHook(() =>
    useFileBackend(host, "filemanager", true),
  );
  await settle();
  expect(result.current.state.phase).toBe("ready");
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ ip: "10.0.0.2" }),
  );
});

test("an unreachable host falls through to the server, with the server's host", async () => {
  const open = jest.fn(async () => {
    throw new SshError("connect", "Connection refused");
  });
  mockCheckOpen.mockResolvedValue({ attempts: [local(open), relay] });
  const { result } = await renderHook(() =>
    useFileBackend(host, "filemanager", true),
  );
  await settle();
  expect(result.current.state).toEqual({
    phase: "relay",
    host: expect.objectContaining({ id: 99 }),
  });
});

test("a refused login stops there and says why", async () => {
  const open = jest.fn(async () => {
    throw new SshError("auth", "Permission denied");
  });
  mockCheckOpen.mockResolvedValue({ attempts: [local(open), relay] });
  const { result } = await renderHook(() =>
    useFileBackend(host, "filemanager", true),
  );
  await settle();
  expect(result.current.state.phase).toBe("failed");
  if (result.current.state.phase === "failed") {
    expect(result.current.state.failure.stage).toBe("auth");
  }
});

test("a blocked plan shows its reason and fix, and waits to be shown first", async () => {
  mockCheckOpen.mockResolvedValue({
    attempts: [],
    blocked: { reason: "File Manager is off on this server.", fix: "device" },
  });
  const { result, rerender } = await renderHook(
    ({ visible }: { visible: boolean }) =>
      useFileBackend(host, "filemanager", visible),
    { initialProps: { visible: false } },
  );
  await settle();
  expect(mockCheckOpen).not.toHaveBeenCalled();
  await rerender({ visible: true });
  await settle();
  expect(result.current.state).toMatchObject({
    phase: "failed",
    fix: "device",
    failure: { message: "File Manager is off on this server." },
  });
});

test("a new copy of the same host does not reconnect", async () => {
  const open = jest.fn(async () => sessionWithHome("/home/u"));
  mockCheckOpen.mockResolvedValue({ attempts: [local(open)] });
  const { rerender } = await renderHook(
    ({ h }: { h: any }) => useFileBackend(h, "filemanager", true),
    { initialProps: { h: host } },
  );
  await settle();
  await rerender({ h: { ...host } });
  await settle();
  expect(mockCheckOpen).toHaveBeenCalledTimes(1);
});

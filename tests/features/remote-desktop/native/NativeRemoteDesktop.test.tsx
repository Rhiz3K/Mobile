import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { NativeRemoteDesktop } from "@/features/remote-desktop/native/NativeRemoteDesktop";
import { SshError } from "@/modules/termix-ssh";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => ({}),
  useTheme: () => ({ isDark: true }),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockCredential = jest.fn(
  async (..._args: any[]): Promise<any> => null as unknown,
);
jest.mock("@/core/data/hooks", () => ({
  useSessionRepositories: () => ({
    credentials: { get: (id: number) => mockCredential(id) },
  }),
}));

const flush = () => act(async () => {});

function fakeDisplay() {
  return {
    frameId: "frame-1",
    pointer: jest.fn(),
    keySym: jest.fn(),
    type: jest.fn(),
    clipboard: jest.fn(),
    resize: jest.fn(),
    refresh: jest.fn(),
    close: jest.fn(),
  };
}

async function setup(host: Record<string, unknown>, open: jest.Mock) {
  const transport = { kind: "local", provides: ["tcp"], openDisplay: open };
  const onStatus = jest.fn();
  const onUseServer = jest.fn();
  await render(
    <NativeRemoteDesktop
      host={
        {
          id: 7,
          name: "PC",
          ip: "pc.lan",
          port: 22,
          username: "u",
          authType: "password",
          ...host,
        } as never
      }
      protocol="rdp"
      transport={transport as never}
      isVisible
      title="PC"
      onStatus={onStatus}
      onUseServer={onUseServer}
    />,
  );
  await fireEvent(screen.getByTestId("native-remote-desktop"), "layout", {
    nativeEvent: { layout: { width: 400, height: 744 } },
  });
  return { onStatus, onUseServer };
}

beforeEach(() => mockCredential.mockClear());

test("connects from the phone with the host's login and the view's size", async () => {
  const display = fakeDisplay();
  const open = jest.fn(async (..._args: any[]): Promise<any> => ({
    display,
    close: jest.fn(),
  }));
  const { onStatus } = await setup(
    { rdpUser: "admin", rdpPassword: "pw", rdpPort: 3390 },
    open,
  );
  await flush();
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ id: 7, ip: "pc.lan" }),
    expect.objectContaining({
      protocol: "rdp",
      port: 3390,
      username: "admin",
      password: "pw",
      width: expect.any(Number),
    }),
    expect.anything(),
  );
  expect(onStatus).toHaveBeenLastCalledWith({ state: "connected" });
});

test("a host set to ask shows the sign-in first and uses what was typed", async () => {
  const open = jest.fn(async (..._args: any[]): Promise<any> => ({
    display: fakeDisplay(),
    close: jest.fn(),
  }));
  await setup({ rdpAuthType: "none", rdpDomain: "CORP" }, open);
  await flush();
  expect(open).not.toHaveBeenCalled();
  expect(screen.getByText("RDP sign-in")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Username"), "me");
  await fireEvent.changeText(screen.getByLabelText("Password"), "secret");
  await fireEvent.press(screen.getByText("Connect"));
  await flush();
  expect(open.mock.calls[0][1]).toMatchObject({
    username: "me",
    password: "secret",
    domain: "CORP",
  });
});

test("a refused login asks again instead of failing", async () => {
  const open = jest.fn(async (..._args: any[]): Promise<any> => {
    throw new SshError("auth", "The RDP server refused the login");
  });
  await setup({ rdpUser: "admin", rdpPassword: "old" }, open);
  await flush();
  expect(screen.getByText("RDP sign-in")).toBeTruthy();
  expect(screen.getByText(/That login was refused/)).toBeTruthy();
});

test("an unreachable host offers the server", async () => {
  const open = jest.fn(async (..._args: any[]): Promise<any> => {
    throw new SshError("connect", "Connection refused");
  });
  const { onUseServer } = await setup({ rdpUser: "a", rdpPassword: "b" }, open);
  await flush();
  expect(screen.getByText("Connection Failed")).toBeTruthy();
  await fireEvent.press(screen.getByText("Connect through the server"));
  expect(onUseServer).toHaveBeenCalled();
});

test("uses the linked login when the host points to one", async () => {
  mockCredential.mockResolvedValueOnce({ username: "cred", password: "x" });
  const open = jest.fn(async (..._args: any[]): Promise<any> => ({
    display: fakeDisplay(),
    close: jest.fn(),
  }));
  await setup({ protocolAuth: { rdp: { credentialId: 5 } } }, open);
  await flush();
  expect(mockCredential).toHaveBeenCalledWith(5);
  expect(open.mock.calls[0][1]).toMatchObject({
    username: "cred",
    password: "x",
  });
});

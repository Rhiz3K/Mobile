import { act, fireEvent, render } from "@testing-library/react-native";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";
import type { BottomTabBarProps } from "expo-router/tabs";
import { BottomBar } from "@/screens/shell/BottomBar";
import { useFeatureAvailable } from "@/core/features/hooks";

jest.mock("@/core/features/hooks", () => ({ useFeatureAvailable: jest.fn() }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#999999",
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({ sessions: [] }),
}));
jest.mock("@/core/sessions/status", () => ({
  useSessionStatuses: () => ({}),
}));
jest.mock("@/utils/orientation", () => ({
  useOrientation: () => ({ isLandscape: false }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);
jest.mock("@/ui/Toast", () => ({ Toaster: () => null }));

const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));
const routes = ["home", "hosts", "sessions", "tools", "settings", "ai"];

function props(active = "home"): BottomTabBarProps {
  return {
    state: {
      index: routes.indexOf(active),
      routes: routes.map((name) => ({ key: `${name}-key`, name })),
    },
    navigation: { navigate: mockNavigate, emit: mockEmit },
  } as unknown as BottomTabBarProps;
}

const realOS = Platform.OS;

beforeEach(() => {
  jest.mocked(useFeatureAvailable).mockReturnValue(true);
  mockNavigate.mockClear();
  mockEmit.mockReset().mockReturnValue({ defaultPrevented: false });
});

afterEach(() => {
  Platform.OS = realOS;
  jest.restoreAllMocks();
});

test.each([true, false])(
  "keeps five bottom buttons when AI availability is %s",
  async (available) => {
    jest.mocked(useFeatureAvailable).mockReturnValue(available);
    const result = await render(<BottomBar {...props("settings")} />);
    expect(useFeatureAvailable).toHaveBeenCalledWith("ai");
    expect(
      result.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel),
    ).toEqual(["Home", "Hosts", "Sessions", "Tools", "Settings"]);
    const settings = result.getByRole("tab", { name: "Settings" });
    expect(settings.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(settings);
    expect(mockNavigate).not.toHaveBeenCalled();
  },
);

test("highlights Tools on AI and lets its button return to Tools", async () => {
  const result = await render(<BottomBar {...props("ai")} />);
  const tools = result.getByRole("tab", { name: "Tools" });
  expect(tools.props.accessibilityState.selected).toBe(true);
  expect(
    result
      .getAllByRole("tab")
      .filter((tab) => tab.props.accessibilityState.selected),
  ).toHaveLength(1);
  await fireEvent.press(tools);
  expect(mockEmit).toHaveBeenCalledWith({
    type: "tabPress",
    target: "tools-key",
    canPreventDefault: true,
  });
  expect(mockNavigate).toHaveBeenCalledWith("tools");
});

test("respects prevented tab presses from AI", async () => {
  mockEmit.mockReturnValueOnce({ defaultPrevented: true });
  const result = await render(<BottomBar {...props("ai")} />);
  await fireEvent.press(result.getByRole("tab", { name: "Tools" }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("leaves AI for Tools when the active account loses AI access", async () => {
  const result = await render(<BottomBar {...props("ai")} />);
  expect(mockNavigate).not.toHaveBeenCalled();
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  await result.rerender(<BottomBar {...props("ai")} />);
  expect(mockNavigate).toHaveBeenCalledWith("tools");
});

test("leaves an initially unavailable AI route for Tools", async () => {
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  await render(<BottomBar {...props("ai")} />);
  expect(mockNavigate).toHaveBeenCalledWith("tools");
});

function captureKeyboard() {
  const callbacks: Record<string, () => void> = {};
  const remove = jest.fn();
  const listener = jest
    .spyOn(Keyboard, "addListener")
    .mockImplementation((event, callback) => {
      callbacks[event] = () => callback({} as KeyboardEvent);
      return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  return { callbacks, remove, listener };
}

test("keeps the bar on iOS without keyboard listeners", async () => {
  Platform.OS = "ios";
  const { listener } = captureKeyboard();
  const result = await render(<BottomBar {...props("ai")} />);
  expect(listener).not.toHaveBeenCalled();
  expect(result.getByRole("tab", { name: "Tools" })).toBeTruthy();
});

test("hides the bar when mounting AI with the Android keyboard already open", async () => {
  Platform.OS = "android";
  jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
  const { callbacks } = captureKeyboard();
  const result = await render(<BottomBar {...props("ai")} />);
  expect(result.queryAllByRole("tab")).toHaveLength(0);
  await act(async () => callbacks.keyboardDidHide());
  expect(result.getByRole("tab", { name: "Tools" })).toBeTruthy();
});

test("hides the bar for the Android AI keyboard only and removes listeners", async () => {
  Platform.OS = "android";
  const { callbacks, remove } = captureKeyboard();
  const result = await render(<BottomBar {...props("ai")} />);
  await act(async () => callbacks.keyboardDidShow());
  expect(result.queryAllByRole("tab")).toHaveLength(0);
  await result.rerender(<BottomBar {...props("settings")} />);
  expect(result.getByRole("tab", { name: "Settings" })).toBeTruthy();
  await result.rerender(<BottomBar {...props("ai")} />);
  expect(result.queryAllByRole("tab")).toHaveLength(0);
  await act(async () => callbacks.keyboardDidHide());
  expect(result.getByRole("tab", { name: "Tools" })).toBeTruthy();
  await result.unmount();
  expect(remove).toHaveBeenCalledTimes(2);
});

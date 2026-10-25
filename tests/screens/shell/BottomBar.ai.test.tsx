import { fireEvent, render } from "@testing-library/react-native";
import { Keyboard, Platform } from "react-native";
import type { BottomTabBarProps } from "expo-router/tabs";
import { BottomBar } from "@/screens/shell/BottomBar";
import { useKeyboard } from "@/contexts/KeyboardContext";

jest.mock("@/contexts/KeyboardContext", () => ({ useKeyboard: jest.fn() }));
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

function props(
  active = "home",
  aiParams?: { from?: unknown },
): BottomTabBarProps {
  return {
    state: {
      index: routes.indexOf(active),
      routes: routes.map((name) => ({
        key: `${name}-key`,
        name,
        params: name === "ai" ? aiParams : undefined,
      })),
    },
    navigation: { navigate: mockNavigate, emit: mockEmit },
  } as unknown as BottomTabBarProps;
}

const realOS = Platform.OS;

beforeEach(() => {
  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 0,
    isKeyboardVisible: false,
    showKeyboard: jest.fn(),
  });
  mockNavigate.mockClear();
  mockEmit.mockReset().mockReturnValue({ defaultPrevented: false });
});

afterEach(() => {
  Platform.OS = realOS;
  jest.restoreAllMocks();
});

test("keeps five bottom buttons and the active tab selected", async () => {
  const result = await render(<BottomBar {...props("settings")} />);
  expect(
    result.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel),
  ).toEqual(["Home", "Hosts", "Sessions", "Tools", "Settings"]);
  const settings = result.getByRole("tab", { name: "Settings" });
  expect(settings.props.accessibilityState.selected).toBe(true);
  await fireEvent.press(settings);
  expect(mockNavigate).not.toHaveBeenCalled();
});

test.each([
  { params: { from: "tools" }, selected: "Tools" },
  { params: { from: "settings" }, selected: "Settings" },
  { params: undefined, selected: "Tools" },
  { params: {}, selected: "Tools" },
  { params: { from: undefined }, selected: "Tools" },
  { params: { from: null }, selected: "Tools" },
  { params: { from: "" }, selected: "Tools" },
  { params: { from: "home" }, selected: "Tools" },
  { params: { from: "Settings" }, selected: "Tools" },
  { params: { from: [] }, selected: "Tools" },
  { params: { from: ["settings"] }, selected: "Tools" },
  { params: { from: ["tools", "settings"] }, selected: "Tools" },
  { params: { from: {} }, selected: "Tools" },
  { params: { from: 1 }, selected: "Tools" },
  { params: { from: true }, selected: "Tools" },
])(
  "highlights $selected on AI with params $params",
  async ({ params, selected }) => {
    const result = await render(<BottomBar {...props("ai", params)} />);
    expect(
      result.getByRole("tab", { name: selected }).props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      result
        .getAllByRole("tab")
        .filter((tab) => tab.props.accessibilityState.selected),
    ).toHaveLength(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  },
);

test("uses the active route when a previous AI route has a Settings origin", async () => {
  const result = await render(
    <BottomBar {...props("home", { from: "settings" })} />,
  );
  expect(
    result
      .getAllByRole("tab")
      .filter((tab) => tab.props.accessibilityState.selected)
      .map((tab) => tab.props.accessibilityLabel),
  ).toEqual(["Home"]);
});

test.each(["tools", "settings"])(
  "lets the Tools button return from AI with %s origin",
  async (from) => {
    const result = await render(<BottomBar {...props("ai", { from })} />);
    await fireEvent.press(result.getByRole("tab", { name: "Tools" }));
    expect(mockEmit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "tools-key",
      canPreventDefault: true,
    });
    expect(mockNavigate).toHaveBeenCalledWith("tools");
  },
);

test.each(["tools", "settings"])(
  "respects prevented tab presses from AI with %s origin",
  async (from) => {
    mockEmit.mockReturnValueOnce({ defaultPrevented: true });
    const result = await render(<BottomBar {...props("ai", { from })} />);
    await fireEvent.press(result.getByRole("tab", { name: "Tools" }));
    expect(mockNavigate).not.toHaveBeenCalled();
  },
);

test.each(["ios", "web"] as const)(
  "keeps the bar with a visible keyboard on %s",
  async (platform) => {
    Platform.OS = platform;
    jest.mocked(useKeyboard).mockReturnValue({
      keyboardHeight: 300,
      isKeyboardVisible: true,
      showKeyboard: jest.fn(),
    });
    const result = await render(<BottomBar {...props("ai")} />);
    expect(result.getAllByRole("tab")).toHaveLength(5);
  },
);

test("uses keyboard context on Android AI without registering its own listeners", async () => {
  Platform.OS = "android";
  const addListener = jest.spyOn(Keyboard, "addListener");
  const isVisible = jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 300,
    isKeyboardVisible: true,
    showKeyboard: jest.fn(),
  });
  const result = await render(<BottomBar {...props("ai")} />);
  expect(result.queryAllByRole("tab")).toHaveLength(0);

  await result.rerender(<BottomBar {...props("settings")} />);
  expect(result.getAllByRole("tab")).toHaveLength(5);
  await result.rerender(<BottomBar {...props("ai")} />);
  expect(result.queryAllByRole("tab")).toHaveLength(0);

  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 0,
    isKeyboardVisible: false,
    showKeyboard: jest.fn(),
  });
  await result.rerender(<BottomBar {...props("ai")} />);
  expect(result.getAllByRole("tab")).toHaveLength(5);
  expect(addListener).not.toHaveBeenCalled();
  expect(isVisible).not.toHaveBeenCalled();
});

import { fireEvent, render } from "@testing-library/react-native";
import type { BottomTabBarProps } from "expo-router/tabs";
import { SideBar } from "@/screens/shell/SideBar";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#999999",
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({ sessions: [] }),
}));
jest.mock("@/core/sessions/status", () => ({
  useSessionStatuses: () => ({}),
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

function props(active = "ai", from?: unknown): BottomTabBarProps {
  return {
    state: {
      index: routes.indexOf(active),
      routes: routes.map((name) => ({
        key: `${name}-key`,
        name,
        params: name === "ai" ? { from } : undefined,
      })),
    },
    navigation: { navigate: mockNavigate, emit: mockEmit },
  } as unknown as BottomTabBarProps;
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockEmit.mockReset().mockReturnValue({ defaultPrevented: false });
});

test.each([
  ["tools", "Tools"],
  ["settings", "Settings"],
  [undefined, "Tools"],
  ["home", "Tools"],
  [["settings"], "Tools"],
])("highlights %s as the AI origin", async (from, selected) => {
  const result = await render(<SideBar {...props("ai", from)} />);
  expect(
    result.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel),
  ).toEqual(["Home", "Hosts", "Sessions", "Tools", "Settings"]);
  expect(
    result
      .getAllByRole("tab")
      .filter((tab) => tab.props.accessibilityState.selected)
      .map((tab) => tab.props.accessibilityLabel),
  ).toEqual([selected]);
});

test.each([
  ["tools", "Tools"],
  ["settings", "Settings"],
])("lets the highlighted %s button leave AI", async (from, label) => {
  const result = await render(<SideBar {...props("ai", from)} />);
  await fireEvent.press(result.getByRole("tab", { name: label }));
  expect(mockEmit).toHaveBeenCalledWith({
    type: "tabPress",
    target: `${from}-key`,
    canPreventDefault: true,
  });
  expect(mockNavigate).toHaveBeenCalledWith(from);
});

test("respects prevented tab presses from AI", async () => {
  mockEmit.mockReturnValueOnce({ defaultPrevented: true });
  const result = await render(<SideBar {...props("ai", "settings")} />);
  await fireEvent.press(result.getByRole("tab", { name: "Settings" }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("uses the active route after leaving AI", async () => {
  const result = await render(<SideBar {...props("home", "settings")} />);
  expect(
    result
      .getAllByRole("tab")
      .filter((tab) => tab.props.accessibilityState.selected)
      .map((tab) => tab.props.accessibilityLabel),
  ).toEqual(["Home"]);
  await fireEvent.press(result.getByRole("tab", { name: "Home" }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

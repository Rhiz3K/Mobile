import { fireEvent, render, screen } from "@testing-library/react-native";
import TerminalCustomization from "@/screens/settings/TerminalCustomization";
import type { TerminalConfig } from "@/types";

const mockState: {
  config: Partial<TerminalConfig>;
  updateConfig: jest.Mock;
} = {
  config: {},
  updateConfig: jest.fn(async () => undefined),
};

jest.mock("@/contexts/TerminalCustomizationContext", () => ({
  useTerminalCustomization: () => ({
    config: mockState.config,
    updateConfig: mockState.updateConfig,
    updateFontSize: jest.fn(),
    resetToDefault: jest.fn(),
  }),
}));

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888888",
  useUiColors: () =>
    new Proxy({}, { get: () => "#888888" }) as Record<string, string>,
  useTheme: () => ({ resolvedTheme: "dark", isDark: true }),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/utils/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  mockState.config = {};
  mockState.updateConfig.mockClear();
});

test("double tap for Tab is off until the switch is turned on", async () => {
  await render(<TerminalCustomization />);
  const toggle = screen.getByLabelText("Double tap sends Tab");
  expect(toggle.props.accessibilityState.checked).toBe(false);
  await fireEvent.press(toggle);
  expect(mockState.updateConfig).toHaveBeenCalledWith({ doubleTapTab: true });
});

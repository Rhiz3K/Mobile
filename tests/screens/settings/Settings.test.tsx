import { fireEvent, render, screen } from "@testing-library/react-native";
import { registerBuiltInFeatures } from "@/features";
import {
  features,
  useSettingsLinks,
  type FeatureContext,
} from "@/core/features";
import { ConfirmProvider } from "@/ui";
import Settings from "@/screens/settings/Settings";
import { resetStorage } from "../../helpers/http";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useTheme: () => ({
    theme: "dark",
    setTheme: jest.fn(),
    accent: "#f59145",
    setAccent: jest.fn(),
  }),
}));
jest.mock("@/core/features/hooks", () => ({
  ...jest.requireActual("@/core/features/hooks"),
  useSettingsLinks: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/",
}));
jest.mock("@/contexts/AppContext", () => ({
  useAppContext: () => ({
    isAuthenticated: false,
    authFlowVisible: false,
    setAuthenticated: jest.fn(),
    openAuthFlow: jest.fn(),
  }),
}));
jest.mock("@/contexts/AppLockContext", () => ({
  useAppLock: () => ({
    enabled: false,
    hasBiometrics: true,
    delayMs: 15000,
    hideInSwitcher: false,
    pinWaitMs: 0,
    setDelayMs: jest.fn(),
    setHideInSwitcher: jest.fn(),
  }),
}));
jest.mock("@/widgets", () => ({
  isWidgetSupported: false,
  DEFAULT_WIDGET_PREFERENCES: {},
  resetWidgets: jest.fn(),
}));
jest.mock("@/modules/termix-session-service", () => ({
  isSessionServiceAvailable: false,
  ignoresBatteryOptimizations: () => true,
  notificationsEnabled: () => true,
  openBatteryOptimizationSettings: jest.fn(),
  openNotificationSettings: jest.fn(),
}));

const mockPush = jest.fn();

beforeAll(() => registerBuiltInFeatures());
beforeEach(async () => {
  await resetStorage();
  mockPush.mockClear();
  jest.mocked(useSettingsLinks).mockReturnValue(
    features.settingsLinks({
      account: { id: "local", kind: "local" },
      client: null,
    } as FeatureContext),
  );
});

describe("Settings", () => {
  it("lists the sections", async () => {
    await render(
      <ConfirmProvider>
        <Settings />
      </ConfirmProvider>,
    );
    for (const title of [
      "Accounts and sync",
      "Appearance",
      "Security",
      "Privacy and usage statistics",
      "About and logs",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.queryByText("Sync and proxy")).toBeNull();
    expect(screen.queryByText("AI Assistant")).toBeNull();
  });

  it.each([false, true])(
    "opens the available AI link with the Settings origin (search: %s)",
    async (searching) => {
      jest.mocked(useSettingsLinks).mockReturnValue(
        features.settingsLinks({
          account: { id: "server", kind: "server" },
          client: { supports: () => true },
        } as unknown as FeatureContext),
      );
      await render(
        <ConfirmProvider>
          <Settings />
        </ConfirmProvider>,
      );
      if (searching) {
        await fireEvent.changeText(
          screen.getByLabelText("Search settings"),
          "conversation",
        );
        expect(screen.getByText("Plugins")).toBeTruthy();
      }
      await fireEvent.press(screen.getByLabelText("AI Assistant"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/ai?from=settings");
    },
  );

  it("filters while you type and opens a result", async () => {
    await render(
      <ConfirmProvider>
        <Settings />
      </ConfirmProvider>,
    );
    await fireEvent.changeText(
      screen.getByLabelText("Search settings"),
      "logs",
    );
    expect(screen.queryByText("Appearance")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Logs"));
    expect(mockPush).toHaveBeenCalledWith("/tabs/settings/Logs");
  });

  it("says when nothing matches", async () => {
    await render(
      <ConfirmProvider>
        <Settings />
      </ConfirmProvider>,
    );
    await fireEvent.changeText(
      screen.getByLabelText("Search settings"),
      "zzzz",
    );
    expect(screen.getByText("No settings match.")).toBeTruthy();
  });
});

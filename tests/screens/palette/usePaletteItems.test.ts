import { renderHook } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import {
  useSettingsLinks,
  useTools,
  type SettingsLinkDef,
  type ToolDef,
} from "@/core/features";
import { usePaletteItems } from "@/screens/palette/usePaletteItems";

jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/contexts/AppContext", () => ({
  useAppContext: () => ({
    openAccountSwitcher: jest.fn(),
    openAuthFlow: jest.fn(),
  }),
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({
    sessions: [],
    activeSessionId: null,
    navigateToSessions: jest.fn(),
  }),
}));
jest.mock("@/core/accounts", () => ({
  useActiveAccount: () => ({ id: "local", kind: "local" }),
}));
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => ({ hosts: {}, snippets: {} }),
  useLiveList: () => ({ data: [] }),
}));
jest.mock("@/core/features", () => ({
  useCapability: () => false,
  useQuickActions: () => ({ actions: [] }),
  useSettingsLinks: jest.fn(),
  useTools: jest.fn(),
}));
jest.mock("@/core/hosts/recent", () => ({ useRecentHosts: () => [] }));
jest.mock("@/core/sessions/handles", () => ({}));
jest.mock("@/features/snippets/run", () => ({}));
jest.mock("@/screens/hosts/useOpenHost", () => ({
  useOpenHost: () => jest.fn(),
}));
jest.mock("@/utils/toast", () => ({}));

const icon = () => null;
const tool = (id: string, href?: string): ToolDef => ({
  id,
  label: id,
  icon,
  order: 0,
  href,
});
const link = (id: string, href: string): SettingsLinkDef => ({
  id,
  label: id,
  icon,
  order: 0,
  href,
});

beforeEach(() => {
  jest.mocked(useTools).mockReturnValue([]);
  jest.mocked(useSettingsLinks).mockReturnValue([]);
  jest.mocked(useRouter).mockReturnValue({ push: jest.fn() } as never);
});

test.each([
  ["/(tabs)/ai", "/(tabs)/ai"],
  ["/(tabs)/ai?view=chat", "/(tabs)/ai"],
  ["/(tabs)/ai", "/(tabs)/ai?view=settings"],
  ["/(tabs)/ai?view=chat", "/(tabs)/ai?view=settings"],
])(
  "keeps only the tool for shared route %s and %s",
  async (toolHref, linkHref) => {
    jest.mocked(useTools).mockReturnValue([tool("ai-tool", toolHref)]);
    jest
      .mocked(useSettingsLinks)
      .mockReturnValue([link("ai-settings", linkHref)]);

    const { result } = await renderHook(() =>
      usePaletteItems({ close: jest.fn(), pickHost: jest.fn() }),
    );

    expect(
      result.current.find((item) => item.id === "tool:ai-tool"),
    ).toBeDefined();
    expect(
      result.current.find((item) => item.id === "settings:ai-settings"),
    ).toBeUndefined();
  },
);

test("keeps distinct settings routes and preserves their navigation query", async () => {
  const close = jest.fn();
  const push = jest.fn();
  jest.mocked(useRouter).mockReturnValue({ push } as never);
  jest.mocked(useTools).mockReturnValue([tool("ai", "/(tabs)/ai")]);
  jest
    .mocked(useSettingsLinks)
    .mockReturnValue([
      link("ai-settings", "/(tabs)/ai/settings?section=models"),
    ]);

  const { result } = await renderHook(() =>
    usePaletteItems({ close, pickHost: jest.fn() }),
  );
  const settings = result.current.find(
    (item) => item.id === "settings:ai-settings",
  );
  expect(settings).toBeDefined();
  settings!.run();
  expect(close).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith("/(tabs)/ai/settings?section=models");
});

test("retains settings links when tools have no matching href", async () => {
  jest.mocked(useTools).mockReturnValue([tool("terminal")]);
  jest
    .mocked(useSettingsLinks)
    .mockReturnValue([link("tools-settings", "/(tabs)/tools")]);

  const { result, rerender } = await renderHook(() =>
    usePaletteItems({ close: jest.fn(), pickHost: jest.fn() }),
  );
  expect(
    result.current.find((item) => item.id === "settings:tools-settings"),
  ).toBeDefined();

  jest.mocked(useTools).mockReturnValue([tool("tools", "/(tabs)/tools")]);
  await rerender({});
  expect(
    result.current.find((item) => item.id === "settings:tools-settings"),
  ).toBeUndefined();

  jest.mocked(useTools).mockReturnValue([]);
  await rerender({});
  expect(
    result.current.find((item) => item.id === "settings:tools-settings"),
  ).toBeDefined();
});

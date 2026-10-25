import { renderHook } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { useTools, type ToolDef } from "@/core/features";
import { aiFeature } from "@/features/ai/register";
import {
  useSettingsGroups,
  type SettingsItemDef,
} from "@/screens/settings/schema";
import { usePaletteItems } from "@/screens/palette/usePaletteItems";
import { rankPalette } from "@/screens/palette/search";
import { linkToItem } from "@/screens/settings/schema/build";

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
  useTools: jest.fn(),
}));
jest.mock("@/screens/settings/schema", () => ({
  useSettingsGroups: jest.fn(),
}));
jest.mock("@/screens/settings/schema/items", () => ({ SETTINGS_ITEMS: [] }));
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
const entry = (id: string, href?: string): SettingsItemDef => ({
  id,
  section: "plugins",
  label: id,
  icon,
  order: 0,
  href,
});
const setEntries = (items: SettingsItemDef[]) =>
  jest.mocked(useSettingsGroups).mockReturnValue([
    {
      section: {
        id: "plugins",
        title: "Plugins",
        description: "What the server adds to the app",
        icon,
        order: 80,
      },
      items,
    },
  ]);

beforeEach(() => {
  jest.mocked(useTools).mockReturnValue([]);
  jest.mocked(useSettingsGroups).mockReturnValue([]);
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
    setEntries([entry("link:ai", linkHref)]);

    const { result } = await renderHook(() =>
      usePaletteItems({ close: jest.fn(), pickHost: jest.fn() }),
    );

    expect(
      result.current.find((item) => item.id === "tool:ai-tool"),
    ).toBeDefined();
    expect(
      result.current.find((item) => item.id === "settings:link:ai"),
    ).toBeUndefined();
  },
);

test("keeps distinct settings routes and preserves their navigation query", async () => {
  const close = jest.fn();
  const push = jest.fn();
  jest.mocked(useRouter).mockReturnValue({ push } as never);
  jest.mocked(useTools).mockReturnValue([tool("ai", "/(tabs)/ai")]);
  setEntries([entry("link:ai", "/(tabs)/ai/settings?section=models")]);

  const { result } = await renderHook(() =>
    usePaletteItems({ close, pickHost: jest.fn() }),
  );
  const settings = result.current.find(
    (item) => item.id === "settings:link:ai",
  );
  expect(settings).toBeDefined();
  settings!.run();
  expect(close).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith("/(tabs)/ai/settings?section=models");
});

test("retains settings entries when tools have no matching href", async () => {
  jest.mocked(useTools).mockReturnValue([tool("terminal")]);
  setEntries([entry("link:tools", "/(tabs)/tools")]);

  const { result, rerender } = await renderHook(() =>
    usePaletteItems({ close: jest.fn(), pickHost: jest.fn() }),
  );
  expect(
    result.current.find((item) => item.id === "settings:link:tools"),
  ).toBeDefined();

  jest.mocked(useTools).mockReturnValue([tool("tools", "/(tabs)/tools")]);
  await rerender({});
  expect(
    result.current.find((item) => item.id === "settings:link:tools"),
  ).toBeUndefined();

  jest.mocked(useTools).mockReturnValue([]);
  await rerender({});
  expect(
    result.current.find((item) => item.id === "settings:link:tools"),
  ).toBeDefined();
});

test("retains settings entries when a host tool has a matching href", async () => {
  const hostTool = {
    ...tool("terminal", "/(tabs)/tools"),
    tabType: "terminal",
  };
  const pickHost = jest.fn();
  jest.mocked(useTools).mockReturnValue([hostTool]);
  setEntries([entry("link:tools", "/(tabs)/tools?view=settings")]);

  const { result } = await renderHook(() =>
    usePaletteItems({ close: jest.fn(), pickHost }),
  );

  expect(
    result.current.find((item) => item.id === "settings:link:tools"),
  ).toBeDefined();
  result.current.find((item) => item.id === "tool:terminal")!.run();
  expect(pickHost).toHaveBeenCalledWith(hostTool);
});

test("indexes Settings home, screen metadata and controls from upstream's groups", async () => {
  const close = jest.fn();
  const push = jest.fn();
  jest.mocked(useRouter).mockReturnValue({ push } as never);
  setEntries([
    {
      ...entry("plugins", "/tabs/settings/Plugins"),
      label: "Plugins",
      description: "What works where",
      keywords: ["extensions"],
    },
    {
      ...entry("sample-control"),
      label: "Server & plugin options",
      Control: () => null,
    },
  ]);
  const { result } = await renderHook(() =>
    usePaletteItems({ close, pickHost: jest.fn() }),
  );

  const home = result.current.find((item) => item.id === "settings:home")!;
  home.run();
  expect(push).toHaveBeenLastCalledWith("/(tabs)/settings");
  const screen = result.current.find((item) => item.id === "settings:plugins")!;
  expect(screen).toEqual(
    expect.objectContaining({
      label: "Plugins",
      detail: "What works where",
      keywords: ["Plugins", "extensions"],
    }),
  );
  screen.run();
  expect(push).toHaveBeenLastCalledWith("/tabs/settings/Plugins");
  const control = result.current.find(
    (item) => item.id === "settings:sample-control",
  )!;
  expect(control.detail).toBe("Plugins");
  control.run();
  expect(push).toHaveBeenLastCalledWith(
    "/(tabs)/settings?q=Server%20%26%20plugin%20options",
  );
  expect(close).toHaveBeenCalledTimes(3);
});

test("opens the registered AI tool once with the Tools origin", async () => {
  const close = jest.fn();
  const push = jest.fn();
  jest.mocked(useRouter).mockReturnValue({ push } as never);
  jest.mocked(useTools).mockReturnValue(aiFeature.tools!);
  setEntries(aiFeature.settingsLinks!.map(linkToItem));
  const { result } = await renderHook(() =>
    usePaletteItems({ close, pickHost: jest.fn() }),
  );
  const ai = result.current.filter((item) => item.label === "AI Assistant");
  expect(ai).toHaveLength(1);
  expect(ai[0].id).toBe("tool:ai");
  ai[0].run();
  expect(close).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith("/(tabs)/ai?from=tools");
});

test.each(["conversation", "artificial intelligence"])(
  "finds the AI tool by its settings keyword %s",
  async (query) => {
    jest.mocked(useTools).mockReturnValue(aiFeature.tools!);
    setEntries(aiFeature.settingsLinks!.map(linkToItem));

    const { result } = await renderHook(() =>
      usePaletteItems({ close: jest.fn(), pickHost: jest.fn() }),
    );

    expect(rankPalette(result.current, query)).toEqual([
      {
        section: "actions",
        items: [
          expect.objectContaining({ id: "tool:ai", label: "AI Assistant" }),
        ],
      },
    ]);
  },
);

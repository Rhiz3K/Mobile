import { render } from "@testing-library/react-native";
import { useFeatureAvailable, useFeatureContext } from "@/core/features";
import type { FeatureContext } from "@/core/features/types";
import AiTab from "../../app/(tabs)/ai";

jest.mock("@/core/features", () => ({
  useFeatureAvailable: jest.fn(),
  useFeatureContext: jest.fn(),
}));
jest.mock("@/screens/settings/AiAssistant", () => () => null);

const mockNavigation = { navigate: jest.fn() };
let mockFocused = true;
let mockFrom: unknown;
jest.mock("expo-router", () => ({
  useNavigation: () => mockNavigation,
  useIsFocused: () => mockFocused,
  useLocalSearchParams: () => ({ from: mockFrom }),
}));

const context = {
  account: { id: "server-a", kind: "server" },
  client: null,
} as unknown as FeatureContext;

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockFrom = undefined;
  mockFocused = true;
  jest.mocked(useFeatureContext).mockReturnValue(context);
  jest.mocked(useFeatureAvailable).mockReturnValue(true);
});

test("stays on an initially unavailable AI route while the client loads", async () => {
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  const result = await render(<AiTab />);
  expect(useFeatureAvailable).toHaveBeenCalledWith("ai");
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  jest.mocked(useFeatureAvailable).mockReturnValue(true);
  await result.rerender(<AiTab />);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
});

test.each([
  ["tools", "tools"],
  ["settings", "settings"],
  [undefined, "tools"],
  ["home", "tools"],
  [["settings"], "tools"],
])(
  "leaves for %s only after the same account loses AI",
  async (from, origin) => {
    mockFrom = from;
    const result = await render(<AiTab />);
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    jest.mocked(useFeatureAvailable).mockReturnValue(false);
    await result.rerender(<AiTab />);
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
    expect(mockNavigation.navigate).toHaveBeenCalledWith(origin);
    await result.rerender(<AiTab />);
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
  },
);

test("switching accounts waits through the new account's loading state", async () => {
  const result = await render(<AiTab />);
  jest.mocked(useFeatureContext).mockReturnValue({
    ...context,
    account: {
      ...context.account,
      id: "server-b",
    } as FeatureContext["account"],
  });
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  await result.rerender(<AiTab />);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  jest.mocked(useFeatureAvailable).mockReturnValue(true);
  await result.rerender(<AiTab />);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  await result.rerender(<AiTab />);
  expect(mockNavigation.navigate).toHaveBeenCalledWith("tools");
});

test("losing availability in the background does not navigate away from another tab", async () => {
  const result = await render(<AiTab />);
  mockFocused = false;
  await result.rerender(<AiTab />);
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  await result.rerender(<AiTab />);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  mockFocused = true;
  await result.rerender(<AiTab />);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
});

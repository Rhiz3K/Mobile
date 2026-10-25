import { act, fireEvent, render } from "@testing-library/react-native";
import {
  BackHandler,
  DeviceEventEmitter,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboard } from "@/contexts/KeyboardContext";
import { useFeatureContext } from "@/core/features";
import type { FeatureContext } from "@/core/features/types";
import type { AiAccess } from "@/features/ai/access";
import { initialRun } from "@/features/ai/run";
import type { AiConversation, AiProvider } from "@/features/ai/types";
import { useAiChat } from "@/features/ai/useAiChat";
import AiAssistant from "@/screens/settings/AiAssistant";
import type { ConfirmOptions } from "@/ui/Confirm";

jest.mock("@/features/ai/useAiChat", () => ({ useAiChat: jest.fn() }));
jest.mock("@/core/features", () => ({ useFeatureContext: jest.fn() }));
jest.mock("@/contexts/KeyboardContext", () => ({ useKeyboard: jest.fn() }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#999999",
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn(),
}));
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);
jest.mock("@/ui/Toast", () => ({ Toaster: () => null }));
jest.mock("@/utils/toast", () => ({ toast: { error: jest.fn() } }));

const mockBack = jest.fn();
const mockNavigate = jest.fn();
let mockFrom: unknown;
let mockFocused = true;
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => ({ navigate: mockNavigate }),
  useLocalSearchParams: () => ({ from: mockFrom }),
  useFocusEffect: (fn: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => (mockFocused ? fn() : undefined), [fn, mockFocused]);
  },
}));
const mockConfirm = jest.fn<Promise<boolean>, [ConfirmOptions]>();
jest.mock("@/ui/Confirm", () => ({ useConfirm: () => mockConfirm }));
const mockOpenURL = jest.spyOn(Linking, "openURL");
const mockGetHosts = jest.fn(async () => [{ id: 7, name: "Production" }]);

const context = {
  account: { id: "server-a", kind: "server", serverUrl: "https://termix.test" },
  client: { api: { hosts: { getSSHHosts: mockGetHosts } } },
} as unknown as FeatureContext;

const provider: AiProvider = {
  id: 2,
  providerType: "ollama",
  label: "Local AI",
  baseUrl: null,
  apiKeyPrefix: null,
  defaultModel: "model-a",
  modelOverrides: { "model-a": {}, "model-b": {} },
  advanced: {},
  enabled: true,
  createdAt: "",
};
const conversation: AiConversation = {
  id: 8,
  title: "Server health",
  providerId: 2,
  model: "model-a",
  createdAt: "2025-03-03T12:00:00.000Z",
  updatedAt: "2025-03-04T12:00:00.000Z",
};

function makeChat(): ReturnType<typeof useAiChat> {
  return {
    access: { state: "ready", allowReadOnlyCommands: true },
    providers: [provider],
    selectedProviderId: 2,
    selectedModel: "model-a",
    conversations: [conversation],
    conversationId: null,
    messages: [],
    run: null,
    proposals: [],
    lockedProposals: [],
    lastUserMessage: null,
    error: null,
    refreshAccess: jest.fn(async () => {}),
    optIn: jest.fn(async () => {}),
    setSelectedProviderId: jest.fn(),
    setSelectedModel: jest.fn(),
    refreshConversations: jest.fn(async () => {}),
    openConversation: jest.fn(async () => {}),
    newConversation: jest.fn(),
    deleteConversation: jest.fn(async () => {}),
    send: jest.fn(async () => true),
    cancel: jest.fn(),
    canResend: false,
    resend: jest.fn(async () => {}),
    applyProposal: jest.fn(async () => {}),
    rejectProposal: jest.fn(async () => {}),
  };
}

let chat: ReturnType<typeof useAiChat>;
beforeEach(() => {
  chat = makeChat();
  jest.mocked(useAiChat).mockReturnValue(chat);
  jest.mocked(useFeatureContext).mockReturnValue(context);
  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 0,
    isKeyboardVisible: false,
    showKeyboard: jest.fn(),
  });
  jest.mocked(useSafeAreaInsets).mockReturnValue({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  mockGetHosts.mockReset().mockResolvedValue([{ id: 7, name: "Production" }]);
  mockConfirm.mockReset().mockResolvedValue(false);
  mockOpenURL.mockReset().mockResolvedValue(undefined);
  mockBack.mockClear();
  mockNavigate.mockClear();
  mockFrom = undefined;
  mockFocused = true;
});

test("loading shows a spinner", async () => {
  chat.access = "loading";
  const result = await render(<AiAssistant />);
  expect(result.getByLabelText("Loading AI assistant")).toBeTruthy();
  expect(result.queryByText("New chat")).toBeNull();
});

test.each<[AiAccess, string]>([
  [{ state: "not-installed" }, "The AI plugin is not installed on this server"],
  [
    { state: "disabled-globally" },
    "An administrator has to enable the AI assistant in the web admin settings",
  ],
  [
    { state: "needs-opt-in", allowReadOnlyCommands: true },
    "Enable the AI assistant for your account",
  ],
  [
    { state: "signed-out" },
    "Your session expired. Sign in again from Settings.",
  ],
  [
    { state: "forbidden" },
    "You do not have permission to use the AI assistant",
  ],
  [{ state: "error", message: "Server unavailable" }, "Server unavailable"],
])("access %s renders its explanation", async (access, text) => {
  chat.access = access;
  const result = await render(<AiAssistant />);
  expect(result.getByText(text)).toBeTruthy();
  expect(result.queryByText("New chat")).toBeNull();
});

test("opting in enables the assistant", async () => {
  chat.access = { state: "needs-opt-in", allowReadOnlyCommands: true };
  const result = await render(<AiAssistant />);
  await fireEvent.press(
    result.getByRole("button", { name: "Enable AI assistant" }),
  );
  expect(chat.optIn).toHaveBeenCalledTimes(1);
});

test("tab mode returns from chat to conversations before leaving for Tools", async () => {
  const result = await render(<AiAssistant mode="tab" />);
  expect(result.getByText("AI Assistant")).toBeTruthy();
  expect(result.getByText("Server health")).toBeTruthy();
  expect(result.getByRole("button", { name: "Back" })).toBeTruthy();
  await fireEvent.press(result.getByText("Server health"));
  await fireEvent.press(
    result.getByRole("button", { name: "Back to conversations" }),
  );
  expect(result.getByText("Server health")).toBeTruthy();
  expect(result.getByRole("button", { name: "Back" })).toBeTruthy();
  expect(chat.cancel).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
  await fireEvent.press(result.getByRole("button", { name: "Back" }));
  expect(mockNavigate).toHaveBeenCalledWith("tools");
  expect(mockBack).not.toHaveBeenCalled();
});

test("tab mode preserves the opt-in AccessState with a Back button", async () => {
  chat.access = { state: "needs-opt-in", allowReadOnlyCommands: true };
  const result = await render(<AiAssistant mode="tab" />);
  expect(
    result.getByText("Enable the AI assistant for your account"),
  ).toBeTruthy();
  expect(result.getByRole("button", { name: "Back" })).toBeTruthy();
  await fireEvent.press(
    result.getByRole("button", { name: "Enable AI assistant" }),
  );
  expect(chat.optIn).toHaveBeenCalledTimes(1);
});

test.each([
  ["tools", "tools"],
  ["settings", "settings"],
  [undefined, "tools"],
  ["home", "tools"],
  [["settings"], "tools"],
])("tab Back validates origin %j and returns to %s", async (from, origin) => {
  mockFrom = from;
  const result = await render(<AiAssistant mode="tab" />);
  await fireEvent.press(result.getByRole("button", { name: "Back" }));
  expect(mockNavigate).toHaveBeenCalledWith(origin);
  expect(mockBack).not.toHaveBeenCalled();
});

test("stack Back returns through the router", async () => {
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "Back" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
});

const realOS = Platform.OS;
let backListener: jest.SpyInstance | undefined;

function captureHardwareBack() {
  const handlers = new Set<
    Parameters<typeof BackHandler.addEventListener>[1]
  >();
  const remove = jest.fn();
  backListener = jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_event, handler) => {
      handlers.add(handler);
      return {
        remove: () => {
          remove();
          handlers.delete(handler);
        },
      };
    });
  return {
    handlers,
    remove,
    press: () => {
      const handler = [...handlers].at(-1);
      expect(handler).toBeDefined();
      return handler!({ type: "hardwareBackPress", timeStamp: Date.now() });
    },
  };
}

afterEach(() => {
  Platform.OS = realOS;
  backListener?.mockRestore();
  backListener = undefined;
});

test("Android tab composer follows the keyboard context value with a bottom inset", async () => {
  Platform.OS = "android";
  jest.mocked(useSafeAreaInsets).mockReturnValue({
    top: 24,
    bottom: 24,
    left: 0,
    right: 0,
  });
  const result = await render(<AiAssistant mode="tab" />);
  await fireEvent.press(result.getByText("New chat"));
  expect(result.getByTestId("ai-chat-composer")).toHaveStyle({
    marginBottom: 0,
  });
  await fireEvent(result.root!, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 720 } },
    persist: jest.fn(),
  });

  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 320,
    isKeyboardVisible: true,
    showKeyboard: jest.fn(),
  });
  await act(() => {
    DeviceEventEmitter.emit("keyboardDidShow", {
      endCoordinates: { screenX: 0, screenY: 480, width: 360, height: 320 },
      duration: 0,
      easing: "keyboard",
    });
  });
  await result.rerender(<AiAssistant mode="tab" />);
  // Hiding BottomBar expands the scene to the screen bottom, including the
  // navigation area. KAV must leave this height alone.
  await fireEvent(result.root!, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 800 } },
    persist: jest.fn(),
  });
  const rootStyle = StyleSheet.flatten(result.root!.props.style);
  expect(rootStyle?.height).toBeUndefined();
  expect(rootStyle?.paddingBottom).toBeUndefined();
  // The inset is not subtracted because the hidden tab bar no longer reserves it.
  expect(result.getByTestId("ai-chat-composer")).toHaveStyle({
    marginBottom: 320,
  });

  // ChatView follows the updated context value.
  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 400,
    isKeyboardVisible: true,
    showKeyboard: jest.fn(),
  });
  await result.rerender(<AiAssistant mode="tab" />);
  expect(result.getByTestId("ai-chat-composer")).toHaveStyle({
    marginBottom: 400,
  });

  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 400,
    isKeyboardVisible: false,
    showKeyboard: jest.fn(),
  });
  await act(() => {
    DeviceEventEmitter.emit("keyboardDidHide");
  });
  await result.rerender(<AiAssistant mode="tab" />);
  expect(result.getByTestId("ai-chat-composer")).toHaveStyle({
    marginBottom: 0,
  });
});

test("Android stack mode keeps the composer offset at zero with the keyboard visible", async () => {
  Platform.OS = "android";
  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 320,
    isKeyboardVisible: true,
    showKeyboard: jest.fn(),
  });
  const result = await render(<AiAssistant mode="stack" />);
  await fireEvent.press(result.getByText("New chat"));
  expect(result.getByTestId("ai-chat-composer")).toHaveStyle({
    marginBottom: 0,
  });
});

test("iOS keeps KAV padding without adding an Android composer offset", async () => {
  Platform.OS = "ios";
  jest.mocked(useKeyboard).mockReturnValue({
    keyboardHeight: 320,
    isKeyboardVisible: true,
    showKeyboard: jest.fn(),
  });
  const result = await render(<AiAssistant mode="tab" />);
  await fireEvent.press(result.getByText("New chat"));
  await fireEvent(result.root!, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 800 } },
    persist: jest.fn(),
  });
  await act(() => {
    DeviceEventEmitter.emit("keyboardWillShow", {
      endCoordinates: { screenX: 0, screenY: 480, width: 360, height: 320 },
      duration: 0,
      easing: "keyboard",
    });
  });
  expect(result.root).toHaveStyle({ paddingBottom: 320 });
  expect(result.getByTestId("ai-chat-composer")).toHaveStyle({
    marginBottom: 0,
  });

  await act(() => {
    DeviceEventEmitter.emit("keyboardWillHide");
  });
  expect(result.root).toHaveStyle({ paddingBottom: 0 });
});

test.each(["tools", "settings", undefined])(
  "Android back returns from chat to the list, then to origin %s",
  async (from) => {
    Platform.OS = "android";
    mockFrom = from;
    const hardware = captureHardwareBack();
    const result = await render(<AiAssistant mode="tab" />);
    await fireEvent.press(result.getByText("New chat"));
    expect(result.getByLabelText("Message")).toBeTruthy();
    await act(() => expect(hardware.press()).toBe(true));
    expect(chat.cancel).toHaveBeenCalledTimes(1);
    expect(result.getByText("Server health")).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(() => expect(hardware.press()).toBe(true));
    expect(mockNavigate).toHaveBeenCalledWith(from ?? "tools");
    expect(mockBack).not.toHaveBeenCalled();
  },
);

test("Android back returns to the origin while access is loading", async () => {
  Platform.OS = "android";
  mockFrom = "settings";
  chat.access = "loading";
  const hardware = captureHardwareBack();
  await render(<AiAssistant mode="tab" />);
  await act(() => expect(hardware.press()).toBe(true));
  expect(mockNavigate).toHaveBeenCalledWith("settings");
});

test("Android back handler is removed when AI loses focus or unmounts", async () => {
  Platform.OS = "android";
  const hardware = captureHardwareBack();
  const result = await render(<AiAssistant mode="tab" />);
  expect(hardware.handlers.size).toBe(1);
  mockFocused = false;
  await result.rerender(<AiAssistant mode="tab" />);
  expect(hardware.handlers.size).toBe(0);
  mockFocused = true;
  await result.rerender(<AiAssistant mode="tab" />);
  expect(hardware.handlers.size).toBe(1);
  await result.unmount();
  expect(hardware.handlers.size).toBe(0);
  expect(hardware.remove).toHaveBeenCalled();
});

test.each<["ios" | "android", "stack" | "tab"]>([
  ["ios", "tab"],
  ["android", "stack"],
])("%s in %s mode leaves hardware back alone", async (os, mode) => {
  Platform.OS = os;
  captureHardwareBack();
  await render(<AiAssistant mode={mode} />);
  expect(backListener).not.toHaveBeenCalled();
});

test("a recently updated conversation shows a relative time", async () => {
  chat.conversations = [
    {
      ...conversation,
      updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
  ];
  const result = await render(<AiAssistant />);
  expect(result.getByText("5m ago")).toBeTruthy();
});

test("an access error can be retried", async () => {
  chat.access = { state: "error", message: "Try later" };
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "Retry" }));
  expect(chat.refreshAccess).toHaveBeenCalledTimes(1);
});

test("ready lists conversations and opens the selected chat", async () => {
  chat.conversations.push({ ...conversation, id: 9, title: null });
  const result = await render(<AiAssistant />);
  expect(result.getByText("Server health")).toBeTruthy();
  expect(result.getByText("New conversation")).toBeTruthy();
  const shownDate = new Date(conversation.updatedAt).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
  expect(result.getAllByText(shownDate)).toHaveLength(2);
  expect(result.queryByText(conversation.updatedAt)).toBeNull();
  await fireEvent.press(result.getByText("Server health"));
  expect(chat.openConversation).toHaveBeenCalledWith(8);
  expect(result.getByLabelText("Message")).toBeTruthy();
  await fireEvent.press(
    result.getByRole("button", { name: "Back to conversations" }),
  );
  expect(result.getByText("Server health")).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

test("New chat resets the conversation and Send passes text and clears the input", async () => {
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "New chat" }));
  expect(chat.newConversation).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(
    result.getByLabelText("Message"),
    "  Check server health  ",
  );
  await fireEvent.press(result.getByRole("button", { name: "Send" }));
  expect(chat.send).toHaveBeenCalledWith("  Check server health  ");
  expect(result.getByLabelText("Message").props.value).toBe("");
  await fireEvent.press(result.getByRole("button", { name: "Send" }));
  expect(chat.send).toHaveBeenCalledTimes(1);
});

test("ChatView keeps the input when send declines the message", async () => {
  jest.mocked(chat.send).mockResolvedValue(false);
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "New chat" }));
  await fireEvent.changeText(
    result.getByLabelText("Message"),
    "Keep this draft",
  );
  await fireEvent.press(result.getByRole("button", { name: "Send" }));
  expect(chat.send).toHaveBeenCalledWith("Keep this draft");
  expect(result.getByLabelText("Message").props.value).toBe("Keep this draft");
});

test("streaming replaces Send with Stop and calls cancel", async () => {
  chat.run = initialRun();
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "New chat" }));
  expect(result.queryByRole("button", { name: "Send" })).toBeNull();
  await fireEvent.press(result.getByRole("button", { name: "Stop" }));
  expect(chat.cancel).toHaveBeenCalledTimes(1);
});

test("deletion waits for confirmation", async () => {
  let settle!: (confirmed: boolean) => void;
  mockConfirm.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      settle = resolve;
    }),
  );
  const result = await render(<AiAssistant />);
  await fireEvent.press(
    result.getByRole("button", { name: "Delete Server health" }),
    {
      stopPropagation: jest.fn(),
    },
  );
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ destructive: true }),
  );
  expect(chat.deleteConversation).not.toHaveBeenCalled();
  expect(chat.openConversation).not.toHaveBeenCalled();
  await act(async () => settle(true));
  expect(chat.deleteConversation).toHaveBeenCalledWith(8);
});

test("pull to refresh reloads conversations", async () => {
  const result = await render(<AiAssistant />);
  await fireEvent(result.getByLabelText("Conversations"), "refresh");
  expect(chat.refreshConversations).toHaveBeenCalledTimes(1);
});

test("Open on web uses the account URL only after confirmation", async () => {
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("link", { name: "Open on web" }));
  expect(mockOpenURL).not.toHaveBeenCalled();
  mockConfirm.mockResolvedValueOnce(true);
  await fireEvent.press(result.getByRole("link", { name: "Open on web" }));
  expect(mockOpenURL).toHaveBeenCalledWith("https://termix.test");
  expect(mockConfirm).toHaveBeenLastCalledWith(
    expect.objectContaining({ destructive: false }),
  );
});

test("the model picker lists only enabled providers and configured models", async () => {
  chat.providers.push({
    ...provider,
    id: 3,
    label: "Disabled AI",
    enabled: false,
  });
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("New chat"));
  await fireEvent.press(
    result.getByRole("button", { name: "Choose provider and model" }),
  );
  expect(result.queryByText("Disabled AI")).toBeNull();
  await fireEvent.press(result.getByRole("button", { name: "Local AI" }));
  expect(chat.setSelectedProviderId).toHaveBeenCalledWith(2);
  await fireEvent.press(result.getByRole("button", { name: "model-b" }));
  expect(chat.setSelectedModel).toHaveBeenCalledWith("model-b");
});

test("the model picker falls back to free text without a configured list", async () => {
  chat.providers = [{ ...provider, modelOverrides: {} }];
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("New chat"));
  await fireEvent.press(
    result.getByRole("button", { name: "Choose provider and model" }),
  );
  await fireEvent.changeText(
    result.getByLabelText("Model name"),
    "custom-model",
  );
  expect(chat.setSelectedModel).toHaveBeenCalledWith("custom-model");
});

test("chat renders history, run, proposals with host names, and errors", async () => {
  chat.messages = [
    {
      id: 1,
      conversationId: 8,
      role: "user",
      content: "Inspect this host",
      toolCalls: null,
      createdAt: "",
    },
  ];
  chat.run = {
    ...initialRun(),
    text: "The server is healthy",
    finished: true,
    finishReason: "cancelled",
  };
  chat.canResend = true;
  chat.proposals = [
    {
      id: 10,
      conversationId: 8,
      kind: "run_command",
      summary: "Check uptime",
      payload: JSON.stringify({ hostId: 7, command: "uptime" }),
      status: "pending",
      resultSummary: null,
      createdAt: "",
    },
  ];
  chat.error = "A request failed";
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("Server health"));
  expect(result.getByText("Inspect this host")).toBeTruthy();
  expect(result.getByText("The server is healthy")).toBeTruthy();
  expect(result.getByText("Hosts: Production")).toBeTruthy();
  expect(result.getByRole("alert")).toHaveTextContent("A request failed");
  await fireEvent.press(result.getByRole("button", { name: "Send again" }));
  expect(chat.resend).toHaveBeenCalledTimes(1);
  expect(mockGetHosts).toHaveBeenCalledTimes(1);
});

test("host lookup failures do not prevent chatting", async () => {
  mockGetHosts.mockRejectedValueOnce(new Error("Unavailable"));
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("New chat"));
  expect(result.getByLabelText("Message")).toBeTruthy();
});

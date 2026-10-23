jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __reset: () => store.clear(),
  };
});

// The app logger is chatty. Set TEST_LOGS=1 to see it.
if (!process.env.TEST_LOGS) {
  for (const level of [
    "log",
    "info",
    "warn",
    "error",
    "debug",
    "group",
    "groupEnd",
  ] as const) {
    jest.spyOn(console, level).mockImplementation(() => {});
  }
}

// Native views that have no JS fallback under Jest.
jest.mock("react-native-webview", () => {
  const { View } = require("react-native");
  return { __esModule: true, WebView: View, default: View };
});

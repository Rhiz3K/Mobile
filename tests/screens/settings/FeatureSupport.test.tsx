import { fireEvent, render, screen } from "@testing-library/react-native";
import { accounts } from "@/core/accounts";
import { registerBuiltInFeatures } from "@/features";
import FeatureSupport from "@/screens/settings/FeatureSupport";
import { fakeServer, resetStorage } from "../../helpers/http";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePathname: () => "/",
}));

beforeAll(() => registerBuiltInFeatures());

beforeEach(resetStorage);

afterEach(async () => {
  await accounts.setActive("local");
  for (const a of accounts.list()) {
    if (a.kind === "server") await accounts.remove(a.id);
  }
});

test("This device lists what works with no server", async () => {
  await render(<FeatureSupport />);
  expect(screen.getByText("What works where")).toBeTruthy();
  expect(screen.getByText(/Works on this phone \(\d+\)/)).toBeTruthy();
  expect(screen.getByText("File Manager")).toBeTruthy();
  expect(screen.getAllByText("Link a server to use it").length).toBeGreaterThan(
    0,
  );
});

test("a linked server shows each plugin's state, and tabs switch accounts", async () => {
  fakeServer((req) => {
    if (req.url.endsWith("/plugins/public-manifest")) return { data: {} };
    if (req.url.endsWith("/plugins")) {
      return {
        data: [
          { id: "ssh-terminal", name: "SSH Terminal", enabled: true },
          { id: "docker", name: "Docker", enabled: false, state: "disabled" },
        ],
      };
    }
    return { data: {} };
  });
  const account = await accounts.add("https://termix.example");
  await accounts.update(account.id, { serverName: "Home" });
  await accounts.client(account.id)!.refreshServerApi();
  await accounts.setActive(account.id);

  await render(<FeatureSupport />);
  expect(screen.getByText("Phone only | off on this server")).toBeTruthy();
  expect(screen.getAllByText("Not on this server").length).toBeGreaterThan(0);

  await fireEvent.press(screen.getByText("This device"));
  expect(screen.queryByText("Phone only | off on this server")).toBeNull();
  expect(screen.getByText(/This device works with no server/)).toBeTruthy();
});

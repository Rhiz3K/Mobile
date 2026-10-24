import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import Home, { pinnedHosts } from "@/screens/home/Home";

const mockPush = jest.fn();
const mockNavigate = jest.fn(async () => null);
let mockHosts: any[] = [];
const mockCard = jest.fn((props: any) => (
  <Text>{`card ${props.host.name} ${props.active ? "on" : "off"}`}</Text>
));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (fn: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(fn, [fn]);
  },
}));
jest.mock("@/components/Screen", () => ({
  Screen: ({ children }: any) => children,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
  useUiColors: () => ({ brand: "#888" }),
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({ navigateToSessions: mockNavigate }),
}));
jest.mock("@/core/accounts", () => ({
  useAccounts: () => ({ active: { id: "local", kind: "local" } }),
}));
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => ({ hosts: { list: async () => mockHosts } }),
  useLiveList: () => ({ data: mockHosts, loading: false }),
}));
jest.mock("@/core/features/hooks", () => ({
  useDashboardCards: (host: any) =>
    host.enableDocker
      ? [
          {
            id: "docker",
            title: "Docker",
            order: 1,
            tabType: "docker",
            component: mockCard,
          },
        ]
      : [],
}));
jest.mock("@/screens/hosts/HostActionSheet", () => ({
  HostActionSheet: () => null,
}));

const host = (over: object) =>
  ({
    id: 1,
    name: "web",
    ip: "10.0.0.1",
    username: "u",
    enableSsh: true,
    pin: true,
    ...over,
  }) as any;

beforeEach(() => {
  mockPush.mockClear();
  mockNavigate.mockClear();
});

test("pinned hosts only, in name order", () => {
  const list = pinnedHosts([
    host({ id: 1, name: "b" }),
    host({ id: 2, name: "a" }),
    host({ id: 3, name: "c", pin: false }),
  ]);
  expect(list.map((h) => h.name)).toEqual(["a", "b"]);
});

test("nothing pinned shows how to pin, with a way to the hosts", async () => {
  mockHosts = [host({ pin: false })];
  await render(<Home />);
  expect(screen.getByText("Pin a host to see it here")).toBeTruthy();
  fireEvent.press(screen.getByText("Go to hosts"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/hosts");
});

test("each pinned host shows its cards, and a card opens its tab", async () => {
  mockHosts = [host({ enableDocker: true }), host({ id: 2, name: "db" })];
  await render(<Home />);
  expect(screen.getByText("card web on")).toBeTruthy();
  expect(screen.getByText(/Turn on Docker or Services/)).toBeTruthy();
  fireEvent.press(screen.getByText("card web on"));
  expect(mockNavigate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1 }),
    "docker",
  );
});

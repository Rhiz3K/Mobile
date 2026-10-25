import { act, renderHook } from "@testing-library/react-native";
import { accounts } from "@/core/accounts";
import { useFeatureAvailable } from "@/core/features/hooks";
import { features } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import { fakeServer, resetStorage } from "../../helpers/http";

const unregister: (() => void)[] = [];

beforeEach(resetStorage);

afterEach(async () => {
  unregister.splice(0).forEach((off) => off());
  await accounts.setActive("local");
  for (const account of accounts.list()) {
    if (account.kind === "server") await accounts.remove(account.id);
  }
});

function register(extra: Partial<FeatureDef> = {}) {
  const off = features.register({
    id: "test-feature",
    title: "Test feature",
    source: "native",
    ...extra,
  });
  unregister.push(off);
  return off;
}

test("an unknown feature is unavailable", async () => {
  const { result } = await renderHook(() =>
    useFeatureAvailable("missing-feature"),
  );
  expect(result.current).toBe(false);
});

test("registry changes update availability without a parent render", async () => {
  const { result } = await renderHook(() =>
    useFeatureAvailable("test-feature"),
  );
  expect(result.current).toBe(false);

  let off!: () => void;
  await act(async () => {
    off = register({ availableOn: ["local"] });
  });
  expect(result.current).toBe(true);

  await act(async () => off());
  expect(result.current).toBe(false);
});

test("client version changes update availability on the same client", async () => {
  let active = false;
  fakeServer(() => ({ data: [{ id: "docker", active }] }));
  register({ requires: { plugin: "docker" } });
  const account = await accounts.add("https://features.example");
  const client = accounts.client(account.id)!;
  await client.storage.data.set("apiGeneration", "plugin");
  await client.storage.data.setJson("serverPlugins", []);
  await accounts.setActive(account.id);
  const { result } = await renderHook(() =>
    useFeatureAvailable("test-feature"),
  );
  expect(result.current).toBe(false);

  active = true;
  await act(async () => client.refreshEnabledPlugins());
  expect(accounts.client(account.id)).toBe(client);
  expect(result.current).toBe(true);

  active = false;
  await act(async () => client.refreshEnabledPlugins());
  expect(result.current).toBe(false);
});

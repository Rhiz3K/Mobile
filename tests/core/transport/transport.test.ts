import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { AppError } from "@/core/errors";
import { pickTransport } from "@/core/transport";
import { RelayShell } from "@/core/transport/relay/RelayShell";

const shellOptions = {
  hostConfig: { id: 1, name: "h" } as any,
  onStateChange: () => {},
  onData: () => {},
  onTotpRequired: () => {},
  onAuthDialogNeeded: () => {},
  onPostConnectionSetup: () => {},
  onDisconnected: () => {},
  onConnectionFailed: () => {},
};

test("This device uses the local transport, off when the build has no engine", () => {
  const t = pickTransport(null);
  expect(t.kind).toBe("local");
  // Jest has no native module, like Expo Go and web.
  expect(t.available).toBe(false);
  expect(t.unavailableReason).toMatch(/no SSH engine/);
  expect(() => t.openShell(shellOptions)).toThrow(AppError);
});

test("a linked server relays, one transport per client", () => {
  const client = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  const t = pickTransport(client);
  expect(t.kind).toBe("relay");
  expect(t.available).toBe(true);
  expect(pickTransport(client)).toBe(t);
  const shell = t.openShell(shellOptions);
  expect(shell).toBeInstanceOf(RelayShell);
  shell.destroy();
});

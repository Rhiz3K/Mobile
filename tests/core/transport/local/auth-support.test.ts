import { AppError } from "@/core/errors";
import {
  assertDeviceAuth,
  hasSecretRef,
  isDeviceAuth,
  needsServerMessage,
  serverAuthPlugin,
} from "@/core/transport/local/auth-support";

test("the phone does password, key, login, none and tailscale", () => {
  for (const t of ["password", "key", "credential", "none", "tailscale"]) {
    expect(isDeviceAuth(t)).toBe(true);
    expect(() => assertDeviceAuth(t)).not.toThrow();
  }
});

test("browser sign in types name their product", () => {
  expect(needsServerMessage("opkssh")).toMatch(/^OPKSSH needs a Termix server/);
  expect(needsServerMessage("vault")).toMatch(/^Vault needs/);
  expect(needsServerMessage("stepca")).toMatch(/^Step CA needs/);
  expect(needsServerMessage("agent")).toMatch(/no SSH agent/);
  expect(needsServerMessage("mystery")).toMatch(/"mystery"/);
});

test("server only types map to their plugin id", () => {
  expect(serverAuthPlugin("stepca")).toBe("step-ca");
  expect(serverAuthPlugin("opkssh")).toBe("opkssh");
  expect(serverAuthPlugin("password")).toBeNull();
});

test("a server only type is refused with AUTH_NEEDS_SERVER", () => {
  try {
    assertDeviceAuth("vault");
    throw new Error("did not throw");
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe("AUTH_NEEDS_SERVER");
  }
});

test("1Password references need the server", () => {
  expect(hasSecretRef("hunter2", undefined)).toBe(false);
  expect(hasSecretRef(" op://Vault/Item/password")).toBe(true);
  expect(() => assertDeviceAuth("password", "op://V/I/f")).toThrow(
    /Secret Sources/,
  );
  expect(() => assertDeviceAuth("key", undefined, "op://V/I/key")).toThrow(
    AppError,
  );
});

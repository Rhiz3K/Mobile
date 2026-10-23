import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { moveLegacyData, MOVED_FLAG } from "@/core/db/legacy-move";
import { resetStorage } from "../../helpers/http";

beforeEach(async () => {
  await resetStorage();
  jest.clearAllMocks();
});

test("drops 1.x plain tokens and saves Keychain items as device only", async () => {
  await AsyncStorage.setItem("jwt", "old-token");
  await AsyncStorage.setItem("serverConfig", "{}");
  await AsyncStorage.setItem("termix-theme", "dark");
  await SecureStore.setItemAsync("appLockPin", "1234");
  await SecureStore.setItemAsync("acct.a1.session", "tok");

  expect(await moveLegacyData({ accountIds: ["local", "a1"] })).toBe(true);

  expect(await AsyncStorage.getItem("jwt")).toBeNull();
  expect(await AsyncStorage.getItem("serverConfig")).toBeNull();
  expect(await AsyncStorage.getItem("termix-theme")).toBe("dark");
  expect(await SecureStore.getItemAsync("appLockPin")).toBe("1234");
  expect(await SecureStore.getItemAsync("acct.a1.session")).toBe("tok");

  const deviceOnly = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("appLockPin");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "appLockPin",
    "1234",
    deviceOnly,
  );
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
    "acct.a1.session",
    "tok",
    deviceOnly,
  );
  expect(await AsyncStorage.getItem(MOVED_FLAG)).toBe("1");
});

test("runs only once", async () => {
  await moveLegacyData({ accountIds: [] });
  await AsyncStorage.setItem("jwt", "came back");
  expect(await moveLegacyData({ accountIds: [] })).toBe(false);
  expect(await AsyncStorage.getItem("jwt")).toBe("came back");
});

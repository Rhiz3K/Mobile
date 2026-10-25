import { act, renderHook } from "@testing-library/react-native";
import { DeviceEventEmitter, Dimensions, Platform } from "react-native";
import { KeyboardProvider, useKeyboard } from "@/contexts/KeyboardContext";

const realOS = Platform.OS;

afterEach(() => {
  Platform.OS = realOS;
  jest.restoreAllMocks();
});

test("Android keyboard height includes the full space below its top", async () => {
  Platform.OS = "android";
  const getDimensions = Dimensions.get.bind(Dimensions);
  jest.spyOn(Dimensions, "get").mockImplementation((dimension) => ({
    ...getDimensions(dimension),
    ...(dimension === "screen" ? { height: 800 } : {}),
  }));
  const { result } = await renderHook(() => useKeyboard(), {
    wrapper: KeyboardProvider,
  });

  await act(() => {
    DeviceEventEmitter.emit("keyboardDidShow", {
      endCoordinates: { screenX: 0, screenY: 480, width: 360, height: 272 },
      duration: 0,
      easing: "keyboard",
    });
  });
  expect(result.current.keyboardHeight).toBe(320);
  expect(result.current.isKeyboardVisible).toBe(true);

  await act(() => {
    DeviceEventEmitter.emit("keyboardDidHide");
  });
  expect(result.current.keyboardHeight).toBe(0);
  expect(result.current.isKeyboardVisible).toBe(false);
});

import {
  addKeyCommandListener,
  setHardwareKeyboardEnabled,
} from "@/modules/hardware-keyboard";

const mockSetEnabled = jest.fn();

jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setEnabled: (value: boolean) => mockSetEnabled(value),
  }),
}));

test("turning the app wide key capture on and off reaches the module", () => {
  setHardwareKeyboardEnabled(true);
  setHardwareKeyboardEnabled(false);
  expect(mockSetEnabled.mock.calls).toEqual([[true], [false]]);
});

test("listeners still subscribe", () => {
  expect(addKeyCommandListener(() => {})).not.toBeNull();
});

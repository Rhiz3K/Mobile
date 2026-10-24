import { XTERM_FALLBACK, shouldUseXterm } from "@/features/terminal/fallback";

test("the native terminal unless the flag is on or the engine is missing", () => {
  expect(shouldUseXterm(undefined, true)).toBe(false);
  expect(shouldUseXterm("0", true)).toBe(false);
  expect(shouldUseXterm("1", true)).toBe(true);
  expect(shouldUseXterm(undefined, false)).toBe(true);
});

test("tests have no engine, so they get the fallback", () => {
  expect(XTERM_FALLBACK).toBe(true);
});

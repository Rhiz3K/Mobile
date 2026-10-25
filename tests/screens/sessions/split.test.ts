import {
  canSplit,
  clampRatio,
  partnerAfterActivate,
  splitPartner,
} from "@/screens/sessions/split";

test("only large screens split", () => {
  expect(canSplit(1024, 768)).toBe(true);
  expect(canSplit(390, 844)).toBe(false);
  expect(canSplit(844, 390)).toBe(false);
});

test("the partner must be another open tab", () => {
  expect(splitPartner(["a", "b"], "a", "b")).toBe("b");
  expect(splitPartner(["a", "b"], "a", "a")).toBeNull();
  expect(splitPartner(["a"], "a", "b")).toBeNull();
  expect(splitPartner(["a", "b"], null, "b")).toBeNull();
  expect(splitPartner(["a", "b"], "a", null)).toBeNull();
});

test("tapping the partner swaps it with the active tab", () => {
  expect(partnerAfterActivate("a", "b", "b")).toBe("a");
  expect(partnerAfterActivate("a", "b", "c")).toBe("b");
  expect(partnerAfterActivate("a", null, "b")).toBeNull();
});

test("the divider stays between 30 and 70 percent", () => {
  expect(clampRatio(0.1)).toBe(0.3);
  expect(clampRatio(0.5)).toBe(0.5);
  expect(clampRatio(0.95)).toBe(0.7);
});

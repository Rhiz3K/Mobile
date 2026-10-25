const config = require("../../app.json").expo;
const { mergeConfigChanges } = require("../../plugins/withLargeScreen");

test("the large screen plugin is registered", () => {
  expect(config.plugins).toContain("./plugins/withLargeScreen.js");
});

test("window change flags are added once and the old ones stay", () => {
  const out = mergeConfigChanges("keyboard|orientation|screenSize|density");
  expect(out.split("|")).toEqual([
    "keyboard",
    "orientation",
    "screenSize",
    "density",
    "smallestScreenSize",
    "layoutDirection",
  ]);
  expect(mergeConfigChanges(out)).toBe(out);
});

test("an empty value gets the flags", () => {
  expect(mergeConfigChanges(undefined)).toBe(
    "smallestScreenSize|density|layoutDirection",
  );
});

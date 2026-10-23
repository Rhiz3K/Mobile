const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo;
const fontPlugin = config.plugins.find(
  (p) => Array.isArray(p) && p[0] === "expo-font",
)[1];
const fontsTs = fs.readFileSync(
  path.join(root, "app/constants/fonts.ts"),
  "utf8",
);
const STYLES = ["Regular", "Bold", "Italic", "BoldItalic"];
const file = (s) => `./assets/fonts/CaskaydiaCoveNerdFontMono-${s}.ttf`;

// Family name stored in the font files (name table id 1).
function familyName(rel) {
  const d = fs.readFileSync(path.join(root, rel));
  const tables = d.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const rec = 12 + 16 * i;
    if (d.toString("ascii", rec, rec + 4) !== "name") continue;
    const off = d.readUInt32BE(rec + 8);
    const count = d.readUInt16BE(off + 2);
    const strings = off + d.readUInt16BE(off + 4);
    for (let j = 0; j < count; j++) {
      const r = off + 6 + 12 * j;
      if (d.readUInt16BE(r) !== 3 || d.readUInt16BE(r + 6) !== 1) continue;
      const len = d.readUInt16BE(r + 8);
      const start = strings + d.readUInt16BE(r + 10);
      return d
        .subarray(start, start + len)
        .swap16()
        .toString("utf16le");
    }
  }
  return null;
}

test("every nerd font style is bundled with its license", () => {
  for (const s of STYLES) {
    assert.ok(fs.existsSync(path.join(root, file(s))), s);
  }
  assert.ok(
    fs.existsSync(path.join(root, "assets/fonts/LICENSE-CaskaydiaCove.txt")),
  );
});

test("iOS embeds all four styles", () => {
  assert.deepEqual(fontPlugin.ios.fonts, STYLES.map(file));
});

test("Android groups the styles under one family", () => {
  const [family] = fontPlugin.android.fonts;
  const name = fontsTs.match(/TERMINAL_FONT = "([^"]+)"/)[1];
  assert.equal(family.fontFamily, name);
  const defs = family.fontDefinitions.map((d) => [
    d.path,
    d.weight,
    d.style ?? "normal",
  ]);
  assert.deepEqual(defs, [
    [file("Regular"), 400, "normal"],
    [file("Bold"), 700, "normal"],
    [file("Italic"), 400, "italic"],
    [file("BoldItalic"), 700, "italic"],
  ]);
});

test("the family name matches the font files, so iOS finds it too", () => {
  const name = fontsTs.match(/TERMINAL_FONT = "([^"]+)"/)[1];
  for (const s of STYLES) assert.equal(familyName(file(s)), name, s);
});

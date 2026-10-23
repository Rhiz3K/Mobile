import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo;
const fontPlugin = config.plugins.find(
  (p: unknown) => Array.isArray(p) && p[0] === "expo-font",
)[1];
const fontsTs = fs.readFileSync(
  path.join(root, "src/constants/fonts.ts"),
  "utf8",
);
const STYLES = ["Regular", "Bold", "Italic", "BoldItalic"];
const file = (s: string) => `./assets/fonts/CaskaydiaCoveNerdFontMono-${s}.ttf`;
const terminalFont = () => fontsTs.match(/TERMINAL_FONT = "([^"]+)"/)![1];

// Family name stored in the font files (name table id 1).
function familyName(rel: string) {
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
      return Buffer.from(d.subarray(start, start + len))
        .swap16()
        .toString("utf16le");
    }
  }
  return null;
}

test("every nerd font style is bundled with its license", () => {
  for (const s of STYLES)
    expect(fs.existsSync(path.join(root, file(s)))).toBe(true);
  expect(
    fs.existsSync(path.join(root, "assets/fonts/LICENSE-CaskaydiaCove.txt")),
  ).toBe(true);
});

test("iOS embeds all four styles", () => {
  expect(fontPlugin.ios.fonts).toEqual(STYLES.map(file));
});

test("Android groups the styles under one family", () => {
  const [family] = fontPlugin.android.fonts;
  expect(family.fontFamily).toBe(terminalFont());
  const defs = family.fontDefinitions.map((d: any) => [
    d.path,
    d.weight,
    d.style ?? "normal",
  ]);
  expect(defs).toEqual([
    [file("Regular"), 400, "normal"],
    [file("Bold"), 700, "normal"],
    [file("Italic"), 400, "italic"],
    [file("BoldItalic"), 700, "italic"],
  ]);
});

test("the family name matches the font files, so iOS finds it too", () => {
  for (const s of STYLES) expect(familyName(file(s))).toBe(terminalFont());
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const theme = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "../app/constants/theme.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: theme },
);

const IDS = [
  "light",
  "dark",
  "dracula",
  "catppuccin",
  "nord",
  "solarized",
  "tokyo-night",
  "one-dark",
  "gruvbox",
];
const TOKENS = Object.keys(theme.THEME_VARS.dark).sort();

test("every theme has the same full token set", () => {
  assert.deepEqual(Object.keys(theme.THEME_VARS).sort(), [...IDS].sort());
  for (const id of IDS) {
    assert.deepEqual(Object.keys(theme.THEME_VARS[id]).sort(), TOKENS, id);
  }
  for (const t of ["warning", "terminal-bg", "surface", "surface-dim"]) {
    assert.ok(TOKENS.includes(t), t);
  }
});

test("every token is a valid RGB triplet", () => {
  for (const id of IDS) {
    for (const [k, v] of Object.entries(theme.THEME_VARS[id])) {
      const parts = v.split(" ");
      assert.equal(parts.length, 3, `${id} ${k}`);
      for (const p of parts) {
        const n = Number(p);
        assert.ok(Number.isInteger(n) && n >= 0 && n <= 255, `${id} ${k}`);
      }
    }
  }
});

test("values match core classic themes", () => {
  assert.equal(theme.THEME_VARS.dark.background, "12 13 11");
  assert.equal(theme.THEME_VARS.dark["terminal-bg"], "12 13 11");
  assert.equal(theme.THEME_VARS.light.background, "255 255 255");
  assert.equal(theme.THEME_VARS.dracula.primary, "139 233 253");
  assert.equal(theme.THEME_VARS.gruvbox.warning, "250 189 47");
  // dracula border is rgba(168,179,217,0.18) over #282a36
  assert.equal(theme.THEME_VARS.dracula.border, "63 67 83");
});

test("only light is a light theme", () => {
  for (const id of IDS) {
    assert.equal(theme.THEME_IS_DARK[id], id !== "light", id);
  }
});

test("default theme is dark and system follows the OS", () => {
  assert.equal(theme.DEFAULT_THEME, "dark");
  assert.equal(theme.resolveTheme("system", "light"), "light");
  assert.equal(theme.resolveTheme("system", "dark"), "dark");
  assert.equal(theme.resolveTheme("system", null), "dark");
  assert.equal(theme.resolveTheme("nord", "light"), "nord");
  assert.equal(theme.resolveTheme("gone", "light"), "dark");
});

test("picker lists every theme with a swatch", () => {
  assert.equal(theme.THEMES[0], "system");
  assert.deepEqual([...theme.THEMES.slice(1)].sort(), [...IDS].sort());
  for (const id of IDS) {
    const sw = theme.THEME_SWATCHES[id];
    for (const c of [sw.background, sw.panel, sw.text]) {
      assert.match(c, /^#[0-9a-f]{6}$/);
    }
    assert.ok(theme.THEME_LABELS[id], id);
  }
});

test("hex and triplet helpers round trip", () => {
  assert.equal(theme.hexToRgbTriplet("#f59145"), "245 145 69");
  assert.equal(theme.hexToRgbTriplet("fff"), "255 255 255");
  assert.equal(theme.hexToRgbTriplet("nope"), null);
  assert.equal(theme.tripletToHex("245 145 69"), "#f59145");
  assert.equal(theme.tripletToHex("0 1 2"), "#000102");
});

test("uiColorsFor maps tokens to hex colors", () => {
  const ui = theme.uiColorsFor("dark", "#fff");
  assert.equal(ui.background, "#0c0d0b");
  assert.equal(ui.terminal, "#0c0d0b");
  assert.equal(ui.brand, "#ffffff");
  assert.equal(ui.textFaint.length, 9);
  assert.equal(theme.uiColorsFor("light", "nope").brand, "#f59145");
});

test("global.css baselines match the light and dark themes", () => {
  const css = fs.readFileSync(path.join(__dirname, "../global.css"), "utf8");
  const block = (sel) => {
    const body = css.split(sel + " {")[1].split("}")[0];
    const out = {};
    for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2];
    return out;
  };
  const root = block(":root");
  assert.equal(root["accent-brand"], "245 145 69");
  delete root["accent-brand"];
  assert.deepEqual(root, { ...theme.THEME_VARS.light });
  assert.deepEqual(block(".dark"), { ...theme.THEME_VARS.dark });
});

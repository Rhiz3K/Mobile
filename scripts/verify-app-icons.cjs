const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PNG } = require("pngjs");
const spec = require("./icon-spec.cjs");

const root = path.join(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo;

function load(rel) {
  const file = path.join(root, rel.replace(/^\.\//, ""));
  assert.ok(fs.existsSync(file), `${rel} is missing`);
  return PNG.sync.read(fs.readFileSync(file));
}

function hex(png, x, y) {
  const i = (y * png.width + x) * 4;
  return (
    "#" +
    [0, 1, 2].map((c) => png.data[i + c].toString(16).padStart(2, "0")).join("")
  );
}

function eachPixel(png, fn) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      fn(x, y, png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]);
    }
  }
}

function outsideSafeCircle(png) {
  const c = png.width / 2;
  const r = (spec.SAFE_CIRCLE * png.width) / 2;
  let outside = 0;
  eachPixel(png, (x, y, _r, _g, _b, a) => {
    if (a === 0) return;
    if (Math.hypot(x + 0.5 - c, y + 0.5 - c) > r) outside++;
  });
  return outside;
}

const splash = config.plugins.find(
  (p) => Array.isArray(p) && p[0] === "expo-splash-screen",
)[1];

test("app.json uses the brand tile color everywhere", () => {
  assert.equal(config.backgroundColor, spec.BRAND.tile);
  assert.equal(config.android.adaptiveIcon.backgroundColor, spec.BRAND.tile);
  assert.equal(splash.backgroundColor, spec.BRAND.tile);
  assert.equal(splash.dark.backgroundColor, spec.BRAND.tile);
});

test("app.json points at the generated images", () => {
  const want = (rel) => "./" + rel;
  assert.equal(config.icon, want(spec.OUT.icon));
  assert.deepEqual(config.ios.icon, {
    light: want(spec.OUT.icon),
    dark: want(spec.OUT.iosDark),
    tinted: want(spec.OUT.iosTinted),
  });
  assert.equal(
    config.android.adaptiveIcon.foregroundImage,
    want(spec.OUT.adaptive),
  );
  assert.equal(
    config.android.adaptiveIcon.monochromeImage,
    want(spec.OUT.monochrome),
  );
  assert.equal(splash.image, want(spec.OUT.splash));
  assert.equal(splash.dark.image, want(spec.OUT.splash));
  assert.ok(config.plugins.includes("./plugins/withNotificationIcon.js"));
});

test("iOS light icon is full bleed and opaque", () => {
  const png = load(spec.OUT.icon);
  assert.equal(png.width, 1024);
  assert.equal(png.height, 1024);
  eachPixel(png, (x, y, _r, _g, _b, a) => {
    if (a !== 255) assert.fail(`transparent pixel at ${x},${y}`);
  });
  assert.equal(hex(png, 0, 0), spec.BRAND.tile);
  assert.equal(hex(png, 1023, 1023), spec.BRAND.tile);
});

test("iOS dark icon has a transparent background", () => {
  const png = load(spec.OUT.iosDark);
  assert.equal(png.width, 1024);
  assert.equal(png.data[3], 0);
  assert.equal(png.data[png.data.length - 1], 0);
});

test("iOS tinted icon is grayscale", () => {
  const png = load(spec.OUT.iosTinted);
  assert.equal(png.width, 1024);
  eachPixel(png, (x, y, r, g, b) => {
    if (r !== g || g !== b) assert.fail(`color pixel at ${x},${y}`);
  });
});

test("adaptive foreground stays inside the safe circle", () => {
  const png = load(spec.OUT.adaptive);
  assert.equal(png.width, 1024);
  assert.equal(outsideSafeCircle(png), 0);
  // The glyph should still reach close to the edge of the circle.
  const c = png.width / 2;
  let reach = 0;
  eachPixel(png, (x, y, _r, _g, _b, a) => {
    if (a > 0) reach = Math.max(reach, Math.hypot(x + 0.5 - c, y + 0.5 - c));
  });
  const r = (spec.SAFE_CIRCLE * png.width) / 2;
  assert.ok(reach > r * 0.85, `glyph too small: reaches ${reach} of ${r}`);
});

test("themed icon is a single color inside the safe circle", () => {
  const png = load(spec.OUT.monochrome);
  assert.equal(png.width, 1024);
  assert.equal(outsideSafeCircle(png), 0);
  eachPixel(png, (x, y, r, g, b, a) => {
    if (a > 0 && (r !== 255 || g !== 255 || b !== 255))
      assert.fail(`non white pixel at ${x},${y}`);
  });
});

test("splash icon fits the Android 12 circle", () => {
  const png = load(spec.OUT.splash);
  assert.equal(outsideSafeCircle(png), 0);
});

test("notification icons exist for every density and are white", () => {
  for (const [density, size] of Object.entries(spec.NOTIFICATION_DENSITIES)) {
    const png = load(
      `${spec.OUT.notificationDir}/notification-icon-${density}.png`,
    );
    assert.equal(png.width, size, density);
    assert.equal(png.height, size, density);
    eachPixel(png, (x, y, r, g, b, a) => {
      if (a > 0 && (r !== 255 || g !== 255 || b !== 255))
        assert.fail(`${density} non white pixel at ${x},${y}`);
    });
  }
});

test("config plugin copies the status bar icon into every density", () => {
  const os = require("node:os");
  const {
    copyNotificationIcons,
  } = require("../plugins/withNotificationIcon.js");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "termix-icons-"));
  try {
    copyNotificationIcons(root, tmp);
    for (const density of Object.keys(spec.NOTIFICATION_DENSITIES)) {
      const file = path.join(
        tmp,
        "app/src/main/res",
        `drawable-${density}`,
        "ic_stat_termix.png",
      );
      assert.ok(fs.existsSync(file), density);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

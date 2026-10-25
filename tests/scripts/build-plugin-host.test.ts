import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../..");
const asset = () =>
  fs.readFileSync(path.join(root, "assets/plugin-host/host.js.html"), "utf8");

// Same as pluginHostSourceHash() in scripts/build-plugin-host.mjs.
function sourceHash() {
  const dir = path.join(root, "scripts/plugin-host");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => path.join(dir, name));
  const hash = createHash("sha256");
  for (const file of [
    ...files,
    path.join(root, "src/core/plugins/frame-protocol.ts"),
  ]) {
    hash.update(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
  }
  return hash.digest("hex").slice(0, 16);
}

test("the plugin host asset was built from the current source (npm run build:plugin-host)", () => {
  const text = asset();
  const header = text.slice(0, text.indexOf("\n"));
  expect(header).toMatch(
    new RegExp(
      `^/\\* termix-plugin-host ${sourceHash()} sdk \\d+\\.\\d+\\.\\d+ \\*/$`,
    ),
  );
});

test("the plugin host page loads no scripts or styles from the network", () => {
  expect(asset()).not.toMatch(/https?:\/\/[^"'\s)]*\.(js|css)\b/);
});

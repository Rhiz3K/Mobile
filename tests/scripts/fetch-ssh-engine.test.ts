import fs from "fs";
import os from "os";
import path from "path";

const { sourceHash, readLock } = require("../../scripts/fetch-ssh-engine.cjs");

function fakeCrate(eol: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termix-ssh-hash-"));
  fs.mkdirSync(path.join(dir, "src", "inner"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "Cargo.toml"),
    ["[package]", 'name = "x"', ""].join(eol),
  );
  fs.writeFileSync(path.join(dir, "Cargo.lock"), ["# lock", ""].join(eol));
  fs.writeFileSync(
    path.join(dir, "src", "lib.rs"),
    ["fn a() {}", ""].join(eol),
  );
  fs.writeFileSync(
    path.join(dir, "src", "inner", "b.rs"),
    ["fn b() {}", ""].join(eol),
  );
  return dir;
}

describe("fetch-ssh-engine", () => {
  it("hashes the same on Windows and Unix line endings", () => {
    expect(sourceHash(fakeCrate("\r\n"))).toBe(sourceHash(fakeCrate("\n")));
  });

  it("changes the hash when any Rust source changes", () => {
    const dir = fakeCrate("\n");
    const before = sourceHash(dir);
    fs.appendFileSync(path.join(dir, "src", "inner", "b.rs"), "// edit\n");
    expect(sourceHash(dir)).not.toBe(before);
  });

  // Fails when modules/termix-ssh/rust changes without a new engine release.
  it("engine.lock.json matches the Rust source", () => {
    const lock = readLock();
    expect(lock.sourceHash).toBe(sourceHash());
    expect(lock.tag).toBe(`termix-ssh-v${lock.version}`);
    expect(Object.keys(lock.assets).sort()).toEqual([
      "termix-ssh-android.tar.gz",
      "termix-ssh-ios.tar.gz",
    ]);
  });
});

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// The viewport code runs inside the WebView, so it is pulled out of the page source.
const source = fs.readFileSync(
  path.join(
    __dirname,
    "../../../src/features/remote-desktop/RemoteDesktop.tsx",
  ),
  "utf8",
);

function load() {
  const block = source
    .slice(
      source.indexOf("      // The server owns"),
      source.indexOf("      // ── Touch mode"),
    )
    .replace("${JSON.stringify(initialSizeRef.current.width)}", "1280")
    .replace("${JSON.stringify(initialSizeRef.current.height)}", "720");
  const display: any = {
    scale(value: number) {
      this.currentScale = value;
    },
  };
  const window: any = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener(_: string, cb: () => void) {
      this.resize = cb;
    },
  };
  const context = vm.createContext({
    display,
    displayElement: { style: {} },
    window,
  });
  vm.runInContext(block, context);
  return {
    display,
    window,
    run: (code: string) => vm.runInContext(code, context),
  };
}

test("a fixed size server is fitted and touch maps to its framebuffer", () => {
  const { display, run } = load();
  display.onresize(2560, 1600);
  expect(display.currentScale).toBe(0.4);
  expect(run("toRemote(1024, 640).x")).toBe(2560);
  expect(run("toRemote(1024, 640).y")).toBe(1600);
  run("zoom = 2; panX = 9999; panY = 9999; clampPan(); applyTransform()");
  expect(run("toRemote(1024, 768).x")).toBe(2560);
  expect(run("toRemote(1024, 768).y")).toBe(1600);
});

test("rotation refits without changing the framebuffer size", () => {
  const { display, window, run } = load();
  display.onresize(2560, 1600);
  window.innerWidth = 768;
  window.innerHeight = 1024;
  run("zoom = 1");
  window.resize();
  expect(display.currentScale).toBe(0.3);
  expect(run("panX + panY")).toBe(0);
  display.onresize(0, 0);
  expect(display.currentScale).toBe(0.3);
});

test("the display is not forced to full width", () => {
  expect(source).not.toContain("width: 100% !important");
});

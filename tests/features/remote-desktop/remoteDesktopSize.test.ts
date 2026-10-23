import { resolveRemoteDesktopSize } from "@/features/remote-desktop/remoteDesktopSize";

test("fixed sizes are kept as they are", () => {
  expect(
    resolveRemoteDesktopSize({ width: 1920, height: 1080 }, 400, 700, 3),
  ).toEqual({ width: 1920, height: 1080 });
  expect(
    resolveRemoteDesktopSize('{"width":"1920","height":"1080"}', 700, 200, 3),
  ).toEqual({ width: 1920, height: 1080 });
});

test("auto sizes follow the screen and pixel ratio", () => {
  expect(
    resolveRemoteDesktopSize({ width: "auto", height: "auto" }, 400, 700, 3),
  ).toEqual({ width: 1200, height: 2100 });
  expect(resolveRemoteDesktopSize({ width: 1920 }, 400, 700, 2)).toEqual({
    width: 1920,
    height: 1400,
  });
});

test("bad config falls back to the screen size", () => {
  for (const config of [null, "", "{", [], { width: -1, height: false }]) {
    expect(resolveRemoteDesktopSize(config as any, 400, 700, 1)).toEqual({
      width: 400,
      height: 700,
    });
  }
});

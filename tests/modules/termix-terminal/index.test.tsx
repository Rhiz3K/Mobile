import { createRef } from "react";
import { render } from "@testing-library/react-native";

import {
  TerminalView,
  createCallQueue,
  isTerminalEngineAvailable,
  nativeTheme,
  type TerminalViewHandle,
} from "@/modules/termix-terminal";
import { surfaceTheme } from "@/screens/dev/terminal-lab/surface";

test("queued calls run once the view is ready, in order", () => {
  const q = createCallQueue();
  const calls: number[] = [];
  q.run(() => calls.push(1));
  q.run(() => calls.push(2));
  expect(calls).toEqual([]);
  expect(q.ready).toBe(false);
  q.markReady();
  q.markReady();
  expect(calls).toEqual([1, 2]);
  q.run(() => calls.push(3));
  expect(calls).toEqual([1, 2, 3]);
});

test("theme maps to the native record", () => {
  const theme = surfaceTheme();
  expect(nativeTheme(theme)).toEqual({
    background: "#0c0d0b",
    foreground: "#f7f7f7",
    cursorColor: "#f7f7f7",
    selectionBackground: "#3a3a3d",
    palette: theme.palette,
  });
  expect(theme.palette).toHaveLength(16);
});

test("unknown theme falls back to the default", () => {
  expect(surfaceTheme("nope").background).toBe(surfaceTheme().background);
});

test("without the native module it renders nothing and reports no stats", async () => {
  expect(isTerminalEngineAvailable).toBe(false);
  const ref = createRef<TerminalViewHandle>();
  const screen = await render(
    <TerminalView
      ref={ref}
      fontSize={14}
      theme={surfaceTheme()}
      onInput={() => {}}
      onResize={() => {}}
    />,
  );
  expect(screen.toJSON()).toBeNull();
  ref.current?.write("AA==");
  await expect(ref.current?.getStats()).resolves.toBeNull();
});

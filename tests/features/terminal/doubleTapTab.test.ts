import vm from "node:vm";
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  LONG_PRESS_MS,
  TAB_KEY,
  TAP_SLOP,
  doubleTapAction,
  effectsForTouches,
  tapsAreDouble,
  xtermDoubleTapPrelude,
  type DoubleTapState,
  type GestureEffect,
  type PointerEvent,
} from "@/features/terminal/doubleTapTab";

const clear: DoubleTapState = { mouse: false, link: false, selecting: false };

function press(
  x: number,
  y: number,
  t: number,
  ms = 40,
  pointers = 1,
): PointerEvent[] {
  return [
    { phase: "down", t, x, y, pointers },
    { phase: "up", t: t + ms, x, y, pointers },
  ];
}

function ups(effects: GestureEffect[]) {
  return effects.filter((e) => e.tab || e.singleTap || e.platformDoubleTap);
}

describe("doubleTapAction", () => {
  test("off keeps the terminal's double tap", () => {
    expect(doubleTapAction(false, clear)).toBe("default");
  });

  test("a clean double tap sends Tab when the setting is on", () => {
    expect(doubleTapAction(true, clear)).toBe("tab");
    expect(TAB_KEY).toBe("\t");
  });

  test("mouse, a link, or a selection keep the terminal's double tap", () => {
    expect(doubleTapAction(true, { ...clear, mouse: true })).toBe("default");
    expect(doubleTapAction(true, { ...clear, link: true })).toBe("default");
    expect(doubleTapAction(true, { ...clear, selecting: true })).toBe(
      "default",
    );
  });
});

describe("tapsAreDouble", () => {
  const first = { t: 1000, x: 10, y: 20 };

  test("the second tap has to land soon and close", () => {
    expect(
      tapsAreDouble(first, { t: 1000 + DOUBLE_TAP_MS, x: 10, y: 20 }),
    ).toBe(true);
    expect(
      tapsAreDouble(first, { t: 1001 + DOUBLE_TAP_MS, x: 10, y: 20 }),
    ).toBe(false);
    expect(
      tapsAreDouble(first, { t: 1100, x: 10 + DOUBLE_TAP_SLOP, y: 20 }),
    ).toBe(true);
    expect(
      tapsAreDouble(first, { t: 1100, x: 11 + DOUBLE_TAP_SLOP, y: 20 }),
    ).toBe(false);
  });

  test("the same moment, a backwards clock, or no first tap is not a pair", () => {
    expect(tapsAreDouble(first, { t: 1000, x: 10, y: 20 })).toBe(false);
    expect(tapsAreDouble(first, { t: 999, x: 10, y: 20 })).toBe(false);
    expect(tapsAreDouble(null, { t: 1100, x: 10, y: 20 })).toBe(false);
  });
});

describe("effectsForTouches", () => {
  test("the first tap focuses and the second sends Tab, without a second focus", () => {
    const effects = ups(
      effectsForTouches([...press(0, 0, 0), ...press(4, 2, 180)], true),
    );
    expect(effects).toEqual([
      { tab: false, singleTap: true, platformDoubleTap: false },
      { tab: true, singleTap: false, platformDoubleTap: false },
    ]);
  });

  test("off still reports the single tap and leaves the double tap to the terminal", () => {
    const effects = ups(
      effectsForTouches([...press(0, 0, 0), ...press(4, 2, 180)], false),
    );
    expect(effects).toEqual([
      { tab: false, singleTap: true, platformDoubleTap: false },
      { tab: false, singleTap: false, platformDoubleTap: true },
    ]);
  });

  test("a slow second tap is two single taps", () => {
    const effects = ups(
      effectsForTouches(
        [...press(0, 0, 0), ...press(0, 0, DOUBLE_TAP_MS + 80)],
        true,
      ),
    );
    expect(effects.every((e) => e.singleTap && !e.tab)).toBe(true);
  });

  test("a scroll is not a tap and does not pair with the next one", () => {
    const events: PointerEvent[] = [
      { phase: "down", t: 0, x: 0, y: 0 },
      { phase: "move", t: 20, x: 0, y: TAP_SLOP + 4 },
      { phase: "up", t: 40, x: 0, y: TAP_SLOP + 8 },
      ...press(0, 0, 80),
    ];
    const effects = ups(effectsForTouches(events, true));
    expect(effects).toEqual([
      { tab: false, singleTap: true, platformDoubleTap: false },
    ]);
  });

  test("a long press selects text and does not send Tab", () => {
    const effects = effectsForTouches(
      [
        { phase: "down", t: 0, x: 5, y: 5 },
        { phase: "up", t: LONG_PRESS_MS, x: 5, y: 5 },
      ],
      true,
    );
    expect(
      effects.some((e) => e.tab || e.singleTap || e.platformDoubleTap),
    ).toBe(false);
  });

  test("a second finger is not a tap", () => {
    const effects = ups(effectsForTouches(press(0, 0, 0, 40, 2), true));
    expect(effects).toEqual([]);
  });

  test("mouse, a link, or a selection do not send Tab", () => {
    const events = [...press(0, 0, 0), ...press(2, 2, 160)];
    for (const state of [
      { ...clear, mouse: true },
      { ...clear, link: true },
      { ...clear, selecting: true },
    ]) {
      const second = ups(effectsForTouches(events, true, state))[1];
      expect(second).toMatchObject({ tab: false, platformDoubleTap: true });
    }
  });

  test("a cancelled press does not pair with the next tap", () => {
    const effects = ups(
      effectsForTouches(
        [
          { phase: "down", t: 0, x: 0, y: 0 },
          { phase: "cancel", t: 10, x: 0, y: 0 },
          ...press(0, 0, 40),
        ],
        true,
      ),
    );
    expect(effects).toEqual([
      { tab: false, singleTap: true, platformDoubleTap: false },
    ]);
  });
});

describe("xterm page script", () => {
  function asks(
    enabled: boolean,
    taps: { t: number; x: number; y: number }[],
    mouse = false,
    selecting = false,
  ) {
    const context: { results?: boolean[] } = {};
    vm.createContext(context);
    const calls = taps
      .map(
        (p) =>
          `results.push(termixPlainTapSendsTab(${p.t}, ${p.x}, ${p.y}, ${mouse}, ${selecting}));`,
      )
      .join("\n");
    vm.runInContext(
      `${xtermDoubleTapPrelude(enabled)}\nvar results = [];\n${calls}`,
      context,
    );
    return context.results ?? [];
  }

  function oracle(
    enabled: boolean,
    taps: { t: number; x: number; y: number }[],
    mouse = false,
    selecting = false,
  ) {
    let last: { t: number; x: number; y: number } | null = null;
    return taps.map((tap) => {
      if (mouse || selecting) {
        last = null;
        return false;
      }
      const send =
        doubleTapAction(enabled, { mouse, link: false, selecting }) === "tab" &&
        tapsAreDouble(last, tap);
      last = send ? null : tap;
      return send;
    });
  }

  test("matches the gesture rule, on and off", () => {
    const taps = [
      { t: 0, x: 0, y: 0 },
      { t: 200, x: 8, y: 4 },
      { t: 280, x: 10, y: 6 },
      { t: 900, x: 10, y: 6 },
    ];
    expect(asks(true, taps)).toEqual(oracle(true, taps));
    expect(asks(false, taps)).toEqual([false, false, false, false]);
    expect(asks(true, taps, true)).toEqual([false, false, false, false]);
    expect(asks(true, taps, false, true)).toEqual([false, false, false, false]);
  });

  test("a far second tap is not Tab", () => {
    const taps = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: DOUBLE_TAP_SLOP + 5, y: 0 },
    ];
    expect(asks(true, taps)).toEqual(oracle(true, taps));
  });
});

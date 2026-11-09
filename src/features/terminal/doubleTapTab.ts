/**
 * Double tap on the terminal sends Tab when the user opts in.
 * Off (the default) keeps the terminal's own double tap, which selects a word.
 *
 * Scrolling, a long press and a single tap never come out as Tab, so text
 * selection and the keyboard stay on their own gestures. A program that wants
 * mouse clicks, a link under the finger, or a selection already on screen
 * keeps that double tap too.
 *
 * Android and iOS decide "this is a double tap" with the platform recognizer
 * and then call the same rule as `doubleTapAction`. The xterm fallback and
 * these helpers share the timing below.
 */

/** How long the second tap may wait. Android's double-tap timeout. */
export const DOUBLE_TAP_MS = 300;

/**
 * How far the second tap may land from the first, in the same units as the
 * points. Android's double-tap slop before display density.
 */
export const DOUBLE_TAP_SLOP = 100;

/** Movement past this during one press is a scroll, not a tap. */
export const TAP_SLOP = 8;

/** A press that lasts this long is a long press, which selects text. */
export const LONG_PRESS_MS = 400;

/** The Tab key, as the terminal wants it. */
export const TAB_KEY = "\t";

export interface PointSample {
  t: number;
  x: number;
  y: number;
}

/** Reasons to leave a double tap alone even when the setting is on. */
export interface DoubleTapState {
  /** vim, tmux, htop: the taps belong to the program. */
  mouse: boolean;
  /** A link is under the finger, or the first tap already opened one. */
  link: boolean;
  /** Text is already selected, or a selection drag is in progress. */
  selecting: boolean;
}

/**
 * What a finished double tap should do.
 * "tab" sends Tab and skips word selection. "default" is today's double tap.
 */
export function doubleTapAction(
  enabled: boolean,
  state: DoubleTapState,
): "tab" | "default" {
  if (!enabled || state.mouse || state.link || state.selecting) {
    return "default";
  }
  return "tab";
}

/** Two taps are one double tap when the second lands soon and close. */
export function tapsAreDouble(
  first: PointSample | null,
  second: PointSample,
  slop = DOUBLE_TAP_SLOP,
  windowMs = DOUBLE_TAP_MS,
): boolean {
  if (!first) return false;
  const dt = second.t - first.t;
  if (!(dt > 0 && dt <= windowMs)) return false;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  return dx * dx + dy * dy <= slop * slop;
}

export type PointerPhase = "down" | "move" | "up" | "cancel";

export interface PointerEvent {
  phase: PointerPhase;
  t: number;
  x: number;
  y: number;
  /** Fingers down. A second finger is a pinch or a scroll, not a tap. */
  pointers?: number;
}

export interface GestureEffect {
  /** Send Tab and do not run the terminal's own double tap. */
  tab: boolean;
  /** A lone tap: focus the terminal and show or hide the keyboard. */
  singleTap: boolean;
  /** A double tap the terminal should keep handling itself. */
  platformDoubleTap: boolean;
}

const NONE: GestureEffect = {
  tab: false,
  singleTap: false,
  platformDoubleTap: false,
};

/**
 * Walks a touch sequence. A double tap sends Tab only when the setting is on
 * and the gesture is not a scroll, a long press, or a second finger. The first
 * tap of that pair still reports as a single tap, so the keyboard is unchanged.
 */
export function effectsForTouches(
  events: readonly PointerEvent[],
  enabled: boolean,
  state: DoubleTapState = { mouse: false, link: false, selecting: false },
): GestureEffect[] {
  const effects: GestureEffect[] = [];
  let down: PointSample | null = null;
  let moved = false;
  let pointers = 1;
  let lastTap: PointSample | null = null;

  for (const event of events) {
    const count = event.pointers ?? 1;
    if (event.phase === "down") {
      down = { t: event.t, x: event.x, y: event.y };
      moved = false;
      pointers = count;
      effects.push(NONE);
      continue;
    }
    if (!down || event.phase === "move") {
      if (down && event.phase === "move") {
        if (count > 1) pointers = count;
        const dx = event.x - down.x;
        const dy = event.y - down.y;
        if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) moved = true;
      }
      effects.push(NONE);
      continue;
    }
    if (event.phase === "cancel") {
      down = null;
      lastTap = null;
      effects.push(NONE);
      continue;
    }

    const duration = event.t - down.t;
    const sample: PointSample = { t: event.t, x: down.x, y: down.y };
    const tap =
      pointers === 1 &&
      count === 1 &&
      !moved &&
      duration >= 0 &&
      duration < LONG_PRESS_MS;
    if (!tap) {
      lastTap = null;
      down = null;
      moved = false;
      pointers = 1;
      effects.push(NONE);
      continue;
    }

    const paired = tapsAreDouble(lastTap, sample);
    if (paired && doubleTapAction(enabled, state) === "tab") {
      effects.push({ tab: true, singleTap: false, platformDoubleTap: false });
      lastTap = null;
    } else if (paired) {
      effects.push({ tab: false, singleTap: false, platformDoubleTap: true });
      lastTap = null;
    } else {
      effects.push({ tab: false, singleTap: true, platformDoubleTap: false });
      lastTap = sample;
    }
    down = null;
    moved = false;
    pointers = 1;
  }
  return effects;
}

/**
 * The same rule, pasted into the xterm page. A plain tap asks it; a scroll,
 * a long press and a selection drag never do.
 */
export function xtermDoubleTapPrelude(enabled: boolean): string {
  const flag = enabled ? "true" : "false";
  return [
    `var termixDoubleTapEnabled = ${flag};`,
    `var termixDoubleTapMs = ${DOUBLE_TAP_MS};`,
    `var termixDoubleTapSlop = ${DOUBLE_TAP_SLOP};`,
    "var termixLastPlainTap = null;",
    "function termixPlainTapSendsTab(t, x, y, mouse, selecting) {",
    "  if (mouse || selecting) { termixLastPlainTap = null; return false; }",
    "  var first = termixLastPlainTap;",
    "  var dt = first ? t - first.t : 0;",
    "  var dx = first ? x - first.x : 0;",
    "  var dy = first ? y - first.y : 0;",
    "  var send = !!(termixDoubleTapEnabled && first && dt > 0 && dt <= termixDoubleTapMs &&",
    "    dx * dx + dy * dy <= termixDoubleTapSlop * termixDoubleTapSlop);",
    "  termixLastPlainTap = send ? null : { t: t, x: x, y: y };",
    "  return send;",
    "}",
  ].join("\n");
}

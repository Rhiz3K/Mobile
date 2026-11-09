import {
  CursorKeyMode,
  encodeCursorKey,
  normalizeCommittedArrows,
} from "@/features/terminal/keys/cursor";

test("Right is SS3 in application cursor mode and CSI otherwise", () => {
  expect(encodeCursorKey("ArrowRight")).toBe("\x1b[C");
  expect(encodeCursorKey("ArrowRight", { cursorApplication: true })).toBe(
    "\x1bOC",
  );
  expect(encodeCursorKey("ArrowUp", { cursorApplication: true })).toBe(
    "\x1bOA",
  );
  expect(encodeCursorKey("ArrowDown", { cursorApplication: true })).toBe(
    "\x1bOB",
  );
  expect(encodeCursorKey("ArrowLeft", { cursorApplication: true })).toBe(
    "\x1bOD",
  );
  expect(encodeCursorKey("Home", { cursorApplication: true })).toBe("\x1bOH");
  expect(encodeCursorKey("End", { cursorApplication: true })).toBe("\x1bOF");
  expect(encodeCursorKey("Tab", { cursorApplication: true })).toBeNull();
});

test("modifiers use the xterm parameter, including with application mode", () => {
  expect(encodeCursorKey("ArrowRight", { shift: true })).toBe("\x1b[1;2C");
  expect(
    encodeCursorKey("ArrowRight", { shift: true, cursorApplication: true }),
  ).toBe("\x1b[1;2C");
  expect(encodeCursorKey("ArrowRight", { ctrl: true })).toBe("\x1b[1;5C");
  expect(encodeCursorKey("ArrowLeft", { alt: true })).toBe("\x1b[1;3D");
  expect(
    encodeCursorKey("ArrowRight", {
      shift: true,
      ctrl: true,
      cursorApplication: true,
    }),
  ).toBe("\x1b[1;6C");
});

test("a committed ESC [ C is rewritten once DECCKM is on", () => {
  expect(normalizeCommittedArrows("\x1b[C", false)).toBe("\x1b[C");
  expect(normalizeCommittedArrows("\x1b[C", true)).toBe("\x1bOC");
  expect(normalizeCommittedArrows("\x1bOC", true)).toBe("\x1bOC");
  expect(normalizeCommittedArrows("ls", true)).toBe("ls");
});

test("less smkx turns application cursor keys on, and off again", () => {
  const mode = new CursorKeyMode();
  mode.feed("ready\x1b[?1h\x1b=");
  expect(mode.application).toBe(true);
  mode.feed("\x1b[?1l\x1b>");
  expect(mode.application).toBe(false);
});

test("mode 1 is noticed among other private modes, and a reset clears it", () => {
  const mode = new CursorKeyMode();
  mode.feed("\x1b[?25h");
  expect(mode.application).toBe(false);
  mode.feed("\x1b[?1049;1h");
  expect(mode.application).toBe(true);
  mode.feed("\x1b[?25l");
  expect(mode.application).toBe(true);
  mode.feed("\x1b[1h");
  expect(mode.application).toBe(true);
  mode.feed("\x1bc");
  expect(mode.application).toBe(false);
});

test("a cursor-mode sequence split across reads still counts", () => {
  const mode = new CursorKeyMode();
  mode.feed("\x1b[?");
  expect(mode.application).toBe(false);
  mode.feed("1h");
  expect(mode.application).toBe(true);
});

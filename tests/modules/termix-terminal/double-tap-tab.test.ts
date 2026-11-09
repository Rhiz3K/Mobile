import fs from "node:fs";
import path from "node:path";

// Gesture recognizers live in native code Jest cannot run. These read the
// handlers to lock the setting's wiring: Tab only on a double tap, and the
// other gestures stay.
const root = path.join(__dirname, "../../..", "modules/termix-terminal");
const kotlin = fs.readFileSync(
  path.join(
    root,
    "android/src/main/java/expo/modules/termixterminal/GhosttyTerminalView.kt",
  ),
  "utf8",
);
const swiftGestures = fs.readFileSync(
  path.join(
    root,
    "ios/vendor/GhosttyTerminal/Platform/UIKit/UITerminalView+TouchGestures.swift",
  ),
  "utf8",
);
const swiftView = fs.readFileSync(
  path.join(root, "ios/TermixTerminalView.swift"),
  "utf8",
);

function body(source: string, start: RegExp): string {
  const at = source.search(start);
  expect(at).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0)
      return source.slice(open, i + 1);
  }
  throw new Error("no closing brace");
}

describe("double tap sends Tab on Android", () => {
  const doubleTap = body(kotlin, /override fun onDoubleTap\(/);
  const single = body(kotlin, /override fun onSingleTapUp\(/);
  const longPress = body(kotlin, /override fun onLongPress\(/);
  const scroll = body(kotlin, /override fun onScroll\(/);

  it("arms Tab on the second finger-down and selects a word otherwise", () => {
    expect(doubleTap).toMatch(/DoubleTapTab\.sendsTab\(/);
    expect(doubleTap).not.toMatch(/sendNamedKey/);
    expect(doubleTap).toMatch(/pendingDoubleTapTab = true/);
    expect(doubleTap).toMatch(/nativeSelectWord/);
    expect(doubleTap).toMatch(/mouseTracking/);
    // The first tap clears a selection before this runs, so that fact is kept.
    expect(doubleTap).toMatch(/selectionDismissedThisTap/);
  });

  it("sends Tab only when the second press lifts cleanly", () => {
    const finish = body(kotlin, /override fun onDoubleTapEvent\(/);
    expect(finish).toMatch(/ACTION_UP/);
    expect(finish).toMatch(/pendingMoved/);
    expect(finish).toMatch(/sendNamedKey\("Tab", false\)/);
    expect(finish).toMatch(/ACTION_CANCEL/);
    const touch = body(kotlin, /override fun onTouchEvent\(/);
    expect(touch).toMatch(/ACTION_CANCEL\) pendingDoubleTapTab = false/);
  });

  it("remembers a tap that dismissed a selection", () => {
    const single = body(kotlin, /override fun onSingleTapUp\(/);
    expect(single).toMatch(/selectionDismissedThisTap = true/);
  });

  it("leaves a single tap on the keyboard", () => {
    expect(single).toMatch(/showKeyboard\(\)/);
    expect(single).not.toMatch(/sendNamedKey/);
  });

  it("leaves a long press selecting text and a scroll scrolling", () => {
    expect(longPress).toMatch(/pendingDoubleTapTab = false/);
    expect(longPress).toMatch(/nativeSelectWord/);
    expect(longPress).not.toMatch(/sendNamedKey/);
    expect(scroll).toMatch(/pendingDoubleTapTab = false/);
    expect(scroll).toMatch(/scrollRows/);
    expect(scroll).not.toMatch(/sendNamedKey/);
  });
});

describe("double tap sends Tab on iOS", () => {
  it("asks the host before selecting a word, and a single tap still toggles the keyboard", () => {
    const handler = body(swiftGestures, /func handleSelectionTap\(/);
    expect(handler).toMatch(/sendTabForDoubleTap\(at: point\)/);
    expect(handler).toMatch(/sendKey\(\.tab\)/);
    expect(handler).toMatch(
      /beginTouchSelection\(at: point, selectAll: false\)/,
    );
    expect(handler).toMatch(/toggleSoftwareKeyboard\(\)/);
    // Tab only for the installed double-tap recognizer.
    expect(handler).toMatch(/tapRecognizers.contains/);
  });

  it("a long press still selects by handing in a synthetic two-tap", () => {
    const press = body(swiftView, /func selectOnLongPress\(/);
    expect(press).toMatch(/SyntheticTap\(point: point, taps: 2\)/);
    expect(press).toMatch(/handleSelectionTap:/);
    expect(press).not.toMatch(/sendKey/);
  });

  it("stays off for mouse tracking, a link, and an existing selection", () => {
    const decide = body(swiftView, /override func sendTabForDoubleTap\(/);
    expect(decide).toMatch(/doubleTapSendsTab/);
    expect(decide).toMatch(/isMouseCaptured/);
    expect(decide).toMatch(/hasTouchSelection/);
    expect(decide).toMatch(/link\(at: point\)/);
  });
});

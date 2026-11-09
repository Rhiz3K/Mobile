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

  it("sends Tab only when the shared rule says so, and still selects a word otherwise", () => {
    expect(doubleTap).toMatch(/DoubleTapTab\.sendsTab\(/);
    expect(doubleTap).toMatch(/sendNamedKey\("Tab", false\)/);
    expect(doubleTap).toMatch(/nativeSelectWord/);
    expect(doubleTap).toMatch(/mouseTracking/);
  });

  it("leaves a single tap on the keyboard", () => {
    expect(single).toMatch(/showKeyboard\(\)/);
    expect(single).not.toMatch(/sendNamedKey/);
  });

  it("leaves a long press selecting text and a scroll scrolling", () => {
    expect(longPress).toMatch(/nativeSelectWord/);
    expect(longPress).not.toMatch(/sendNamedKey/);
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
  });

  it("stays off for mouse tracking and an existing selection", () => {
    const decide = body(swiftView, /override func sendTabForDoubleTap\(/);
    expect(decide).toMatch(/doubleTapSendsTab/);
    expect(decide).toMatch(/isMouseCaptured/);
    expect(decide).toMatch(/hasTouchSelection/);
  });
});

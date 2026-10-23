# termix-terminal

The phone's native terminal view, on [libghostty](https://github.com/ghostty-org/ghostty).
On iOS it renders with Metal through [libghostty-spm](https://github.com/Lakr233/libghostty-spm);
on Android a Canvas renderer draws over libghostty-vt. The native code started as
[expo-libghostty](https://github.com/arcboxlabs/expo-libghostty) 0.8.1 (see NOTICE).

The view only parses and draws. Pty output goes in through `write`, typed bytes come out through
`onInput`, so it works with any transport (the local SSH engine or the server relay).

## What it does

- Truecolor, 256 colors, bold, italic, underline styles, wide characters and emoji, alt screen
- The app's CaskaydiaCove Nerd Font (embedded by the expo-font config plugin)
- Software keyboard with IME composition, hardware keyboard (kitty protocol when asked)
- Selection with handles, copy, paste (bracketed when the program asks)
- Scrollback with fling, pinch to zoom the font
- Mouse reporting: taps are clicks and drags are wheel steps while the program tracks the mouse
- Bell and title events

## Use

```tsx
import {
  TerminalView,
  type TerminalViewHandle,
} from "@/modules/termix-terminal";

const ref = useRef<TerminalViewHandle>(null);

<TerminalView
  ref={ref}
  fontSize={14}
  theme={theme}
  onInput={(b64) => shell.write(fromBase64(b64))}
  onResize={(cols, rows) => shell.resize(cols, rows)}
/>;

ref.current?.write(toBase64(bytes));
```

Calls made before the view reports its first size are queued. `isTerminalEngineAvailable` is false
in Expo Go, on web and on 32 bit Android phones (libghostty-vt is built for arm64-v8a and x86_64).

## Known limits

- iOS: theme and font are shared by every terminal view, and changing `fontSize` after mount
  rebuilds the surface, which clears the screen. Pinch zoom does not.
- iOS reports no frame times (Metal draws on its own thread); `getStats` only has bytes there.
- The app's own accessory row is used; the one from expo-libghostty is left out.

## Binaries

Not in git. `plugins/withTermixTerminal.js` runs `scripts/fetch-ghostty.cjs` at prebuild, which
downloads the files pinned in `ghostty.lock.json` (the GhosttyKit xcframework from libghostty-spm,
and libghostty-vt for Android built by expo-libghostty's workflow from a pinned ghostty commit),
checks their sha256 and unpacks them to `ios/vendor/Frameworks` and `android/vendor`.

## Tests

Jest tests for the JS wrapper are in `tests/modules/termix-terminal`. The terminal lab
(`app/dev/terminal-lab`, dev builds only) runs the view against echo, flood, alt screen and SSH
streams with a frame time and memory readout. The engine choice and its measurements are on the
`spike/terminal-view` branch.

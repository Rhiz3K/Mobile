# termix-display

Native view for remote desktops (VNC and RDP) on the phone. The SSH engine draws each changed
rectangle into a frame by id, and the view shows it, so pixels never cross the JS bridge.

- `FrameBuffer`: the desktop's pixels plus the area changed since the view last drew.
- `TermixFrames.get(id)` and `release(id)`: process wide frames, so the engine and the view meet
  without JS.
- `TermixDisplayView` (JS): `frameId`, `scale`, `offsetX`, `offsetY` place the desktop; zoom and pan
  math lives in `src/features/remote-desktop/viewport.ts`. `onKey` reports hardware keys.

This is the D5 prototype; only the dev display lab uses it. Kotlin tests are in `android/src/test`.

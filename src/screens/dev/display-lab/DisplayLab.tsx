// Display lab (D5 prototype): VNC and RDP opened by the phone's own engine,
// drawn by the native display view, with the touch and key design to try on a
// real device. Dev builds only; users still go through the server.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PixelRatio,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { Button, Input, Label, Tabs, Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { resolveRemoteDesktopSize } from "@/features/remote-desktop/remoteDesktopSize";
import {
  fitScale,
  clampPan,
  type Viewport,
} from "@/features/remote-desktop/viewport";
import {
  TermixDisplayView,
  isDisplayAvailable,
  type TermixDisplayHandle,
} from "@/modules/termix-display";
import {
  displayProtocols,
  openDisplay,
  SshError,
  type DisplayProtocol,
  type RemoteDisplay,
} from "@/modules/termix-ssh";

import {
  DisplayGestures,
  LEFT,
  MIDDLE,
  RIGHT,
  type GestureAction,
  type Point,
  type PointerMode,
} from "./gestures";
import { keysymFor } from "./keys";

const DEFAULT_PORT: Record<DisplayProtocol, string> = {
  vnc: "5900",
  rdp: "3389",
};
const RESIZE_DEBOUNCE_MS = 400;

const CTRL = 0xffe3;
const ALT = 0xffe9;
const DEL = 0xffff;

function points(e: GestureResponderEvent): Point[] {
  return e.nativeEvent.touches.map((t) => ({ x: t.locationX, y: t.locationY }));
}

/** The size and scale to ask an RDP server for, from the view in points. */
function rdpSizeFor(w: number, h: number, pixelRatio: number) {
  const size = resolveRemoteDesktopSize({}, w, h, pixelRatio);
  return {
    width: size.width,
    height: size.height,
    scale: Math.round(((size.dpi ?? 96) * 100) / 96),
  };
}

function KeyButton({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const colors = useUiColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 34,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.border,
        backgroundColor: active ? colors.brand : colors.card,
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 12, color: active ? "#fff" : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function DisplayLab() {
  const colors = useUiColors();
  const insets = useSafeAreaInsets();
  const protocols = useMemo(() => displayProtocols(), []);
  const [protocol, setProtocol] = useState<DisplayProtocol>("vnc");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT.vnc);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [display, setDisplay] = useState<RemoteDisplay | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [zoomPan, setZoomPan] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [mode, setMode] = useState<PointerMode>("touch");
  const [held, setHeld] = useState(0);
  const [remoteClip, setRemoteClip] = useState<string | null>(null);
  const gestures = useRef<DisplayGestures | null>(null);
  const viewRef = useRef<TermixDisplayHandle>(null);
  const inputRef = useRef<TextInput>(null);
  const displayRef = useRef<RemoteDisplay | null>(null);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  // The view and framebuffer sizes make the viewport; zoom and pan carry over.
  const view = useMemo<Viewport | null>(
    () =>
      layout.w && size.w
        ? clampPan({
            viewW: layout.w,
            viewH: layout.h,
            remoteW: size.w,
            remoteH: size.h,
            ...zoomPan,
          })
        : null,
    [layout, size, zoomPan],
  );
  const setView = (v: Viewport) =>
    setZoomPan({ zoom: v.zoom, panX: v.panX, panY: v.panY });

  useEffect(() => {
    if (!view) return;
    if (!gestures.current) gestures.current = new DisplayGestures(view, mode);
    else gestures.current.setView(view);
  }, [view, mode]);

  // RDP follows rotation; the keyboard never resizes the desktop.
  useEffect(() => {
    if (!display || protocol !== "rdp" || !layout.w) return;
    const timer = setTimeout(() => {
      const s = rdpSizeFor(layout.w, layout.h, PixelRatio.get());
      display.resize(s.width, s.height, s.scale);
    }, RESIZE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [display, protocol, layout]);

  useEffect(() => () => displayRef.current?.close(), []);

  const apply = useCallback((actions: GestureAction[]) => {
    for (const a of actions) {
      if (a.kind === "pointer")
        displayRef.current?.pointer(a.x, a.y, a.buttons);
      else
        setZoomPan({ zoom: a.view.zoom, panX: a.view.panX, panY: a.view.panY });
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const s = rdpSizeFor(layout.w || 390, layout.h || 700, PixelRatio.get());
      const d = await openDisplay(
        {
          protocol,
          host: host.trim(),
          port: Number(port) || Number(DEFAULT_PORT[protocol]),
          username: username || undefined,
          password: password || undefined,
          domain: domain || undefined,
          width: s.width,
          height: s.height,
          scale: protocol === "rdp" ? s.scale : 0,
          connectTimeoutSecs: 15,
        },
        {
          onResize: (w, h) => setSize({ w, h }),
          onClipboard: (text) => setRemoteClip(text),
          onClosed: (reason) => {
            setDisplay(null);
            setSize({ w: 0, h: 0 });
            if (reason) setError(reason);
          },
        },
      );
      setDisplay(d);
      setTimeout(() => viewRef.current?.focus(), 100);
    } catch (err) {
      // A refused login keeps the form open so it can be typed again.
      setError(
        err instanceof SshError && err.kind === "auth"
          ? `The login was refused. ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setBusy(false);
    }
  }, [protocol, host, port, username, password, domain, layout]);

  const toggleHeld = (button: number) => {
    const next = held ^ button;
    setHeld(next);
    if (gestures.current) gestures.current.held = next;
    const g = gestures.current;
    if (g && display) {
      display.pointer(g.cursor.x, g.cursor.y, next);
    }
  };

  const chord = (syms: number[]) => {
    syms.forEach((s) => display?.keySym(s, true));
    [...syms].reverse().forEach((s) => display?.keySym(s, false));
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: Math.round(width), h: Math.round(height) });
  };

  const now = () => Date.now();
  const placement: [number, number, number] = view
    ? [fitScale(view) * view.zoom, view.panX, view.panY]
    : [1, 0, 0];

  if (!isDisplayAvailable || !protocols.length) {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: insets.top + 16 }}>
        <Text>This build has no native display or remote protocols.</Text>
      </View>
    );
  }

  if (!display) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: insets.top + 16,
          gap: 10,
        }}
        keyboardShouldPersistTaps="handled"
        onLayout={onLayout}
      >
        <Text weight="bold">Display lab</Text>
        <Tabs
          options={protocols.map((p) => ({ id: p, label: p.toUpperCase() }))}
          value={protocol}
          onChange={(p) => {
            setProtocol(p);
            setPort(DEFAULT_PORT[p]);
          }}
        />
        <Label>Host</Label>
        <Input
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Label>Port</Label>
        <Input value={port} onChangeText={setPort} keyboardType="number-pad" />
        <Label>Username</Label>
        <Input
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Label>Password</Label>
        <Input
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        {protocol === "rdp" ? (
          <>
            <Label>Domain</Label>
            <Input
              value={domain}
              onChangeText={setDomain}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : null}
        {error ? <Text style={{ color: colors.brand }}>{error}</Text> : null}
        <Button
          onPress={connect}
          loading={busy}
          disabled={!host.trim() || busy}
        >
          Connect
        </Button>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        <TermixDisplayView
          ref={viewRef}
          frameId={display.frameId}
          placement={placement}
          style={{ flex: 1 }}
          onKey={(e) => {
            const sym = keysymFor(e.nativeEvent);
            if (sym != null) display.keySym(sym, e.nativeEvent.down);
          }}
        />
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) =>
            apply(gestures.current?.begin(points(e), now()) ?? [])
          }
          onResponderStart={(e) =>
            apply(gestures.current?.begin(points(e), now()) ?? [])
          }
          onResponderMove={(e) =>
            apply(gestures.current?.move(points(e)) ?? [])
          }
          onResponderEnd={(e) =>
            apply(
              gestures.current?.end(e.nativeEvent.touches.length, now()) ?? [],
            )
          }
        />
      </View>
      <TextInput
        ref={inputRef}
        value=""
        onChangeText={(t) => t && display.type(t)}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Backspace") chord([0xff08]);
        }}
        onSubmitEditing={() => {
          chord([0xff0d]);
          setTimeout(() => inputRef.current?.focus(), 10);
        }}
        submitBehavior="submit"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        style={{
          flexGrow: 0,
          backgroundColor: colors.background,
          paddingBottom: insets.bottom,
        }}
        contentContainerStyle={{ gap: 4, padding: 4, alignItems: "center" }}
      >
        <KeyButton
          label={mode === "touch" ? "Touch" : "Trackpad"}
          onPress={() => {
            const next = mode === "touch" ? "trackpad" : "touch";
            setMode(next);
            gestures.current?.setMode(next);
          }}
        />
        <KeyButton
          label="L"
          active={!!(held & LEFT)}
          onPress={() => toggleHeld(LEFT)}
        />
        <KeyButton
          label="M"
          active={!!(held & MIDDLE)}
          onPress={() => toggleHeld(MIDDLE)}
        />
        <KeyButton
          label="R"
          active={!!(held & RIGHT)}
          onPress={() => toggleHeld(RIGHT)}
        />
        <KeyButton label="Keyboard" onPress={() => inputRef.current?.focus()} />
        <KeyButton label="Esc" onPress={() => chord([0xff1b])} />
        <KeyButton label="Tab" onPress={() => chord([0xff09])} />
        <KeyButton
          label="Ctrl+Alt+Del"
          onPress={() => chord([CTRL, ALT, DEL])}
        />
        <KeyButton
          label="Paste"
          onPress={() =>
            Clipboard.getStringAsync().then((t) => display.clipboard(t))
          }
        />
        <KeyButton
          label="Type clipboard"
          onPress={() =>
            Clipboard.getStringAsync().then((t) => display.type(t))
          }
        />
        {remoteClip != null ? (
          <KeyButton
            label="Copy remote clipboard"
            onPress={() => Clipboard.setStringAsync(remoteClip)}
          />
        ) : null}
        <KeyButton
          label="Fit"
          onPress={() =>
            view && setView(clampPan({ ...view, zoom: 1, panX: 0, panY: 0 }))
          }
        />
        <KeyButton label="Refresh" onPress={() => display.refresh()} />
        <KeyButton label="Close" onPress={() => display.close()} />
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            paddingHorizontal: 6,
          }}
        >
          {`${protocol.toUpperCase()} ${size.w}x${size.h} | ${(view?.zoom ?? 1).toFixed(1)}x`}
        </Text>
      </ScrollView>
    </View>
  );
}

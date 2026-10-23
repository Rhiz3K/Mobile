/**
 * TermixTerminal - the native terminal view, on libghostty.
 *
 * iOS renders with Metal through libghostty-spm; Android draws on a Canvas
 * over libghostty-vt. The view only parses and draws: pty output comes in
 * through write, typed bytes go out through onInput, so any transport works.
 * Binary data is base64 on the bridge.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { ComponentType, Ref } from "react";
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";
import { requireNativeView } from "expo";
import { requireOptionalNativeModule } from "expo-modules-core";

import type {
  TerminalStats,
  TerminalTheme,
  TerminalViewHandle,
  TerminalViewProps,
} from "./src/types";

export * from "./src/types";

type Ev<T> = NativeSyntheticEvent<T>;

interface NativeHandle {
  write(base64: string): Promise<void>;
  paste(text: string): Promise<void>;
  scrollToBottom(): Promise<void>;
  copySelection(): Promise<void>;
  focus(): Promise<void>;
  blur(): Promise<void>;
  getStats(): Promise<TerminalStats>;
}

interface NativeProps {
  fontSize: number;
  theme: Record<string, unknown>;
  onInput: (e: Ev<{ data: string }>) => void;
  onResize: (e: Ev<{ cols: number; rows: number }>) => void;
  onBell?: (e: Ev<object>) => void;
  onTitleChange?: (e: Ev<{ title: string }>) => void;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<NativeHandle>;
}

const MODULE = "TermixTerminal";

/**
 * False in Expo Go, on web, in builds without the module and on 32 bit
 * Android phones, which libghostty-vt is not built for.
 */
export const isTerminalEngineAvailable =
  requireOptionalNativeModule<{ engineLoaded?: boolean }>(MODULE)
    ?.engineLoaded === true;

const NativeView: ComponentType<NativeProps> | null = isTerminalEngineAvailable
  ? requireNativeView(MODULE)
  : null;

export function nativeTheme(theme: TerminalTheme): Record<string, unknown> {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursorColor: theme.cursor,
    selectionBackground: theme.selectionBackground,
    palette: theme.palette,
  };
}

/**
 * The native view registers after the first commit, so calls made before it
 * reports its first grid size are queued.
 */
export function createCallQueue() {
  let ready = false;
  const pending: (() => void)[] = [];
  return {
    run(call: () => void) {
      if (ready) call();
      else pending.push(call);
    },
    markReady() {
      if (ready) return;
      ready = true;
      for (const call of pending.splice(0)) call();
    },
    get ready() {
      return ready;
    },
  };
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(
  function TerminalView(props, ref) {
    const native = useRef<NativeHandle>(null);
    const queue = useMemo(createCallQueue, []);

    useImperativeHandle(ref, () => {
      const call = (fn: (n: NativeHandle) => Promise<unknown>) =>
        queue.run(() => {
          if (native.current) fn(native.current).catch(() => {});
        });
      return {
        write: (b64) => call((n) => n.write(b64)),
        paste: (text) => call((n) => n.paste(text)),
        scrollToBottom: () => call((n) => n.scrollToBottom()),
        copySelection: () => call((n) => n.copySelection()),
        focus: () => call((n) => n.focus()),
        blur: () => call((n) => n.blur()),
        getStats: async () =>
          queue.ready && native.current ? native.current.getStats() : null,
      };
    }, [queue]);

    if (!NativeView) return null;
    return (
      <NativeView
        ref={native}
        style={props.style}
        fontSize={props.fontSize}
        theme={nativeTheme(props.theme)}
        onInput={(e) => props.onInput(e.nativeEvent.data)}
        onResize={(e) => {
          queue.markReady();
          props.onResize(e.nativeEvent.cols, e.nativeEvent.rows);
        }}
        onBell={() => props.onBell?.()}
        onTitleChange={(e) => props.onTitle?.(e.nativeEvent.title)}
      />
    );
  },
);

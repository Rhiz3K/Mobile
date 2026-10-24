import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadXtermAssets } from "@/features/terminal/loadXtermAssets";
import {
  View,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import { RotateCcw } from "lucide-react-native";
import { Text } from "@/ui";
import { useTheme, useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";
import { XTERM_FALLBACK } from "@/features/terminal/fallback";
import { resolveTerminalSettings } from "@/features/terminal/settings";
import {
  TerminalView,
  type TerminalViewApi,
} from "@/features/terminal/TerminalView";
import type { SSHHost, DockerContainer } from "@/types";
import { useSessionClient } from "@/core/accounts/session";

/**
 * Interactive `docker exec` console on the native terminal view (xterm in a
 * WebView under the fallback flag), bridged to the backend docker console
 * WebSocket. Connect, then input, resize and output go both ways.
 *
 * Kept deliberately small: this is a shell into a container, not the full
 * terminal experience (no command history / snippets), so it skips the heavier
 * Terminal machinery.
 */
export function DockerConsole({
  host,
  container,
  isVisible,
}: {
  host: SSHHost;
  container: DockerContainer;
  isVisible: boolean;
}) {
  const client = useSessionClient();
  const color = useThemeColor();
  const webViewRef = useRef<WebView>(null);
  const terminalRef = useRef<TerminalViewApi>(null);
  const sizeRef = useRef({ cols: 80, rows: 24 });
  const { resolvedTheme } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { config } = useTerminalCustomization();
  const settings = useMemo(
    () =>
      resolveTerminalSettings(
        { ...MOBILE_DEFAULT_TERMINAL_CONFIG, ...config },
        undefined,
        resolvedTheme,
        fontScale,
      ),
    [config, resolvedTheme, fontScale],
  );
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "error" | "closed"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [webViewKey, setWebViewKey] = useState(0);
  const [consoleHtml, setConsoleHtml] = useState<string | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage("");
    const token = await client.token();
    if (!token) {
      setStatus("error");
      setErrorMessage("Not authenticated");
      return;
    }
    try {
      wsRef.current?.close();
    } catch {}

    const ws = client.openSocket(client.dockerConsoleWebSocketUrl(token), [
      `termix.jwt.${token}`,
    ]) as WebSocket;
    wsRef.current = ws;

    ws.onopen = () => {
      send({
        type: "connect",
        data: {
          // The server checks the ip we think we picked against the one it
          // resolves from the id, and refuses the shell if they differ. Sending
          // only the id reads as a mismatch, so pass the address too. syncId
          // takes priority there when the host came from a sync server.
          hostConfig: {
            id: host.id,
            ip: host.ip,
            syncId: host.syncId ?? undefined,
            enableDocker: true,
          },
          containerId: container.id,
          cols: sizeRef.current.cols,
          rows: sizeRef.current.rows,
        },
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "output") {
          if (XTERM_FALLBACK) {
            webViewRef.current?.injectJavaScript(
              `window.__write(${JSON.stringify(msg.data)}); true;`,
            );
          } else {
            terminalRef.current?.write(msg.data);
          }
        } else if (msg.type === "connected") {
          setStatus("connected");
          send({ type: "resize", data: sizeRef.current });
        } else if (msg.type === "error") {
          setStatus("error");
          setErrorMessage(msg.message || "Console error");
        } else if (msg.type === "disconnected") {
          setStatus("closed");
        }
      } catch {}
    };

    ws.onerror = () => {
      setStatus("error");
      setErrorMessage("Connection failed");
    };

    ws.onclose = () => {
      setStatus((s) => (s === "error" ? s : "closed"));
    };
  }, [host.id, host.ip, host.syncId, container.id, send]);

  useEffect(() => {
    if (!XTERM_FALLBACK) return;
    let cancelled = false;
    loadXtermAssets(false)
      .then((assets) => {
        if (!cancelled) setConsoleHtml(buildConsoleHtml(assets));
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Failed to load the console");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      try {
        send({ type: "disconnect" });
        wsRef.current?.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webViewKey]);

  const onWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "input") {
          send({ type: "input", data: msg.data });
        } else if (msg.type === "resize") {
          send({ type: "resize", data: { cols: msg.cols, rows: msg.rows } });
        }
      } catch {}
    },
    [send],
  );

  const reconnect = () => setWebViewKey((k) => k + 1);

  if (!isVisible || (XTERM_FALLBACK && !consoleHtml)) return null;

  return (
    <View className="flex-1 bg-black">
      {XTERM_FALLBACK ? (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ html: consoleHtml ?? "" }}
          onMessage={onWebViewMessage}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          style={{ flex: 1, backgroundColor: "#000" }}
        />
      ) : (
        <TerminalView
          key={webViewKey}
          ref={terminalRef}
          settings={settings}
          onInput={(data) => send({ type: "input", data })}
          onResize={(cols, rows) => {
            sizeRef.current = { cols, rows };
            send({ type: "resize", data: { cols, rows } });
          }}
        />
      )}
      {status !== "connected" ? (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-black/80">
          {status === "connecting" ? (
            <>
              <ActivityIndicator size="large" color={color("accent-brand")} />
              <Text className="text-sm text-muted-foreground">
                Attaching to {container.name}…
              </Text>
            </>
          ) : (
            <>
              <Text className="px-8 text-center text-sm text-destructive">
                {errorMessage || "Console disconnected"}
              </Text>
              <Pressable
                onPress={reconnect}
                className="flex-row items-center gap-1.5 border border-border px-3 py-2 active:bg-muted/40"
              >
                <RotateCcw size={14} color={color("foreground")} />
                <Text className="text-xs text-foreground">Reconnect</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const buildConsoleHtml = (assets: {
  xtermJs: string;
  xtermCss: string;
  fitAddonJs: string;
}) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<script>${assets.xtermJs}</script>
<script>${assets.fitAddonJs}</script>
<style>${assets.xtermCss}</style>
<style>
  html, body, #term { margin:0; padding:0; height:100%; width:100%; background:#000; overflow:hidden; }
  .xterm { padding:6px; }
</style>
</head>
<body>
<div id="term"></div>
<script>
  var term = new Terminal({
    cursorBlink: true,
    fontFamily: 'monospace',
    fontSize: 13,
    theme: { background: '#000000', foreground: '#e4e4e7' },
    scrollback: 2000,
  });
  var fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('term'));
  function doFit() {
    try {
      fit.fit();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'resize', cols: term.cols, rows: term.rows }));
      }
    } catch (e) {}
  }
  setTimeout(doFit, 50);
  window.addEventListener('resize', doFit);
  window.__write = function(d){ term.write(d); };
  term.onData(function(d){
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'input', data: d }));
    }
  });
  term.focus();
</script>
</body>
</html>`;

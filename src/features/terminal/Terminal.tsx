import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { showToast } from "@/utils/toast";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";
import type { SSHHost, TerminalConfig } from "@/types";
import type {
  StickyModifierState,
  TerminalInputHandle,
  TerminalKeyTarget,
} from "@/core/features/types";
import type {
  ConnectionOrigin,
  HostConnection,
  TerminalHostConfig,
  TransportKind,
} from "@/core/transport";
import { ConnectionLog } from "@/screens/sessions/shared/useConnectionLog";
import { useHostConnection } from "@/screens/sessions/shared/useHostConnection";
import { ConnectionPrompts } from "@/screens/sessions/shared/ConnectionPrompts";
import { ConnectionError } from "@/screens/sessions/shared/ConnectionError";
import { useTheme, useUiColors } from "@/contexts/ThemeContext";
import { useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import { useSessionRepositories } from "@/core/data/hooks";
import { resolveTerminalSettings } from "./settings";
import {
  findStartupSnippet,
  startupLines,
  type StartupInput,
  type StartupLine,
} from "./startup";
import { CommandLineTracker } from "./history/capture";
import { SuggestionStrip } from "./history/SuggestionStrip";
import { SearchBar } from "./SearchBar";
import {
  attachLine,
  listSessionsCommand,
  listWindowsCommand,
  newSessionName,
  parseSessions,
  parseWindows,
  planTmuxAttach,
  selectWindowKeys,
  type TmuxWindow,
} from "./tmux/tmux";
import {
  TmuxPickerSheet,
  TmuxWindowsSheet,
  type PickSession,
} from "./tmux/TmuxSheets";
import { controlCode } from "./keys/dispatch";
import { useKeyLayout } from "./keys/useKeyLayout";
import type { TerminalSearchResult } from "@/modules/termix-terminal";
import { PromptWatcher, pickPassword } from "./password-prompt";
import { PasswordFillSheet, type FillChoice } from "./PasswordFillSheet";
import { PASSWORD_FILL_PREF, hostCanFill } from "./password-fill";
import {
  TerminalView,
  type ModifierState,
  type TerminalViewApi,
} from "./TerminalView";
import {
  XtermTerminalView,
  type XtermTerminalApi,
} from "./xterm/XtermTerminalView";
import { XTERM_FALLBACK } from "./fallback";

interface TerminalProps {
  host: SSHHost;
  hostConfig: TerminalHostConfig & { terminalConfig?: Partial<TerminalConfig> };
  /** Session tab type, for what it needs from the transport. */
  type: string;
  /** Overrides the host's saved origin for this tab. */
  origin?: ConnectionOrigin;
  isVisible: boolean;
  title?: string;
  onClose?: () => void;
  onBackgroundColorChange?: (color: string) => void;
  /** Stable tab instance id (cross-device session tracking). */
  tabInstanceId?: string;
  /** Backend session id to attach to on first connect (reviving a tab). */
  initialSessionId?: string | null;
  /** Fired when the backend session id is created/attached/cleared. */
  onSessionIdChange?: (sessionId: string | null) => void;
  onTransportResolved?: (kind: TransportKind) => void;
  onTitle?: (title: string | null) => void;
  onMenu?: () => void;
}

export type TerminalHandle = TerminalInputHandle;

// Clears the screen and scrollback before a server replays a session.
const CLEAR_FOR_REPLAY = "\x1b[2J\x1b[3J\x1b[H";

let pipeSeq = 0;

const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  (
    {
      host,
      hostConfig,
      type,
      origin,
      isVisible,
      onClose,
      onBackgroundColorChange,
      tabInstanceId,
      initialSessionId,
      onSessionIdChange,
      onTransportResolved,
      onTitle,
      onMenu,
    },
    ref,
  ) => {
    // Null on This device, where the phone connects on its own.
    const client = useClient(useSessionAccountId());
    const repos = useSessionRepositories();
    const ui = useUiColors();
    const { resolvedTheme } = useTheme();
    const { fontScale } = useWindowDimensions();
    const { config, updateFontSize } = useTerminalCustomization();
    const nativeRef = useRef<TerminalViewApi>(null);
    const xtermRef = useRef<XtermTerminalApi>(null);
    const connRef = useRef<HostConnection | null>(null);
    const sizeRef = useRef<{ cols: number; rows: number } | null>(null);
    const connectedOnce = useRef(false);
    const transportRef = useRef<TransportKind | null>(null);

    const settings = useMemo(
      () =>
        resolveTerminalSettings(
          { ...MOBILE_DEFAULT_TERMINAL_CONFIG, ...config },
          hostConfig.terminalConfig,
          resolvedTheme,
          fontScale,
        ),
      [config, hostConfig.terminalConfig, resolvedTheme, fontScale],
    );

    useEffect(() => {
      onBackgroundColorChange?.(settings.colors.background);
    }, [settings.colors.background, onBackgroundColorChange]);

    const useShellTitle = hostConfig.terminalConfig?.useSSHTitle === true;
    useEffect(() => {
      if (!useShellTitle) onTitle?.(null);
    }, [useShellTitle, onTitle]);
    const historyOn = hostConfig.terminalConfig?.enableCommandHistory !== false;
    const hostRef = useRef(host);
    hostRef.current = host;
    const historyOnRef = useRef(historyOn);
    historyOnRef.current = historyOn;
    const [tracker] = useState(
      () =>
        new CommandLineTracker({
          onSubmit: (line, save) => {
            const h = hostRef.current;
            if (!save || !historyOnRef.current || !(h.id > 0)) return;
            repos.commandHistory.add(h, line).catch(() => {});
          },
          isPasswordInput: () =>
            watcherRef.current?.atPasswordPrompt() ?? false,
        }),
    );

    // Password and sudo prompts: offer the saved password, asking first.
    const watcherRef = useRef<PromptWatcher | null>(null);
    const [fillAsk, setFillAsk] = useState<{ sudo: boolean } | null>(null);
    const fillOn = hostConfig.terminalConfig?.passwordPromptAutoFill !== false;
    const fillOnRef = useRef(fillOn);
    fillOnRef.current = fillOn;
    const fill = useCallback(
      async (sudo: boolean) => {
        const h = hostRef.current;
        const full = await repos.hosts.get(h.id).catch(() => null);
        const password = pickPassword(sudo, {
          password: full?.password ?? h.password,
          sudoPassword: full?.sudoPassword ?? h.sudoPassword,
        });
        if (!password) {
          watcherRef.current?.settle(false);
          showToast.warning("No saved password for this host");
          return;
        }
        // Straight to the host, so it never reaches history.
        connRef.current?.sendInput(`${password}\r`);
        watcherRef.current?.settle(true);
      },
      [repos],
    );
    const fillRef = useRef(fill);
    fillRef.current = fill;
    if (!watcherRef.current) {
      watcherRef.current = new PromptWatcher({
        settings: () => ({
          passwordPromptAutoFill: fillOnRef.current,
          sudoPasswordAutoFill:
            hostRef.current.terminalConfig?.sudoPasswordAutoFill === true,
        }),
        canFill: () => hostCanFill(hostRef.current),
        lastCommand: () => tracker.lastSubmitted(),
        offer: (sudo) => {
          repos.hostPrefs
            .get(hostRef.current, PASSWORD_FILL_PREF)
            .catch(() => null)
            .then((pref) => {
              if (pref === "always") void fillRef.current(sudo);
              else setFillAsk({ sudo });
            });
        },
      });
    }
    const onFillChoice = useCallback(
      (choice: FillChoice) => {
        const ask = fillAsk;
        setFillAsk(null);
        if (!ask) return;
        if (choice === "no") {
          watcherRef.current?.settle(false);
          return;
        }
        if (choice === "always") {
          repos.hostPrefs
            .set(hostRef.current, PASSWORD_FILL_PREF, "always")
            .catch(() => {});
        }
        void fill(ask.sudo);
      },
      [fillAsk, fill, repos],
    );
    const suggestionsOn = !!config.commandSuggestions && historyOn;
    const [history, setHistory] = useState<string[]>([]);
    useEffect(() => {
      if (!suggestionsOn || !(host.id > 0)) return;
      const load = () =>
        repos.commandHistory
          .list(host)
          .then(setHistory)
          .catch(() => {});
      load();
      return repos.commandHistory.subscribe(load);
    }, [suggestionsOn, host, repos]);

    const sendInput = useCallback(
      (data: string) => {
        tracker.track(data);
        connRef.current?.sendInput(data);
      },
      [tracker],
    );

    // Startup lines wait for the shell's first output, so they land at a prompt.
    const startupPending = useRef(false);
    const handlePostConnectionSetup = useCallback(() => {
      startupPending.current = true;
    }, []);
    // tmux: sessions to pick from, and the one this tab attached to.
    const [tmuxPick, setTmuxPick] = useState<{
      sessions: PickSession[];
      relay: boolean;
    } | null>(null);
    const [tmuxWindows, setTmuxWindows] = useState<TmuxWindow[] | null>(null);
    const tmuxSessionRef = useRef<string | null>(null);
    const startupBase = useRef<StartupInput | null>(null);

    const typeLines = useCallback((lines: StartupLine[]) => {
      let at = 0;
      for (const line of lines) {
        setTimeout(() => connRef.current?.sendInput(`${line.text}\r`), at);
        at += line.waitAfterMs ?? 100;
      }
    }, []);

    const attachLocalTmux = useCallback(
      (name: string | null) => {
        const base = startupBase.current;
        if (!base) return;
        if (name === null) {
          typeLines(startupLines(base));
          return;
        }
        const fresh = name === "";
        const target = fresh
          ? newSessionName(String(hostRef.current.syncId ?? hostRef.current.id))
          : name;
        tmuxSessionRef.current = target;
        typeLines(
          startupLines({
            ...base,
            tmux: { line: attachLine(target, fresh), fresh },
          }),
        );
      },
      [typeLines],
    );

    const runStartup = useCallback(async () => {
      const terminalConfig: Partial<TerminalConfig> = {
        ...MOBILE_DEFAULT_TERMINAL_CONFIG,
        ...config,
        ...hostConfig.terminalConfig,
      };
      let snippet = null;
      if (terminalConfig.startupSnippetId != null) {
        snippet = findStartupSnippet(
          await repos.snippets.list().catch(() => []),
          terminalConfig.startupSnippetId,
        );
      }
      const base: StartupInput = {
        transport: transportRef.current,
        sshOptions: host.sshOptions,
        legacyEnv: terminalConfig.environmentVariables,
        snippet,
        host: {
          ip: hostConfig.ip,
          username: hostConfig.username,
          port: hostConfig.port,
          name: hostConfig.name,
        },
        mosh: terminalConfig.autoMosh ? terminalConfig.moshCommand : null,
      };
      startupBase.current = base;
      // A relay shell's tmux is the server's; a phone shell checks itself.
      if (terminalConfig.autoTmux && transportRef.current === "local") {
        const found = await connRef.current
          ?.exec(listSessionsCommand(), 10)
          .catch(() => null);
        if (found?.exitCode === 127) {
          showToast.info("tmux is not installed on this host");
        } else if (found) {
          const sessions = parseSessions(found.stdout);
          const plan = planTmuxAttach(sessions.length);
          if (plan === "pick") {
            setTmuxPick({ sessions, relay: false });
            return;
          }
          attachLocalTmux(plan === "create" ? "" : sessions[0].name);
          return;
        }
      }
      typeLines(startupLines(base));
    }, [
      config,
      hostConfig,
      host.sshOptions,
      repos,
      attachLocalTmux,
      typeLines,
    ]);

    const onTmuxPick = useCallback(
      (name: string | null) => {
        const pick = tmuxPick;
        setTmuxPick(null);
        if (!pick) return;
        if (pick.relay) {
          if (name) tmuxSessionRef.current = name;
          connRef.current?.attachTmux(name ?? "");
        } else {
          attachLocalTmux(name);
        }
      },
      [tmuxPick, attachLocalTmux],
    );

    // One pipe for the tab's life: reconnects and new views attach to it again.
    const [pipeId] = useState(() => `term-${++pipeSeq}`);

    const { conn, state, log, switchTo, switchOrigin } = useHostConnection(
      host,
      hostConfig,
      {
        type,
        origin,
        tabInstanceId,
        initialSessionId,
        pipeId: XTERM_FALLBACK ? undefined : pipeId,
        onSessionIdChange,
        onTransportResolved: (kind) => {
          transportRef.current = kind;
          onTransportResolved?.(kind);
        },
        onConnected: ({ fromBackground, isReattach }) => {
          if (XTERM_FALLBACK) {
            xtermRef.current?.notifyConnected(fromBackground, isReattach);
          } else if (
            transportRef.current === "relay" &&
            (fromBackground || isReattach)
          ) {
            // The server sends the session's screen again.
            nativeRef.current?.write(CLEAR_FOR_REPLAY);
          }
          if (client) {
            client.api.homepage
              .logActivity("terminal", hostConfig.id, hostConfig.name)
              .catch(() => {});
          } else {
            repos.recentActivity
              .add({ kind: "terminal", title: hostConfig.name })
              .catch(() => {});
          }
        },
        onData: (data) => {
          watcherRef.current?.feed(data);
          if (XTERM_FALLBACK) xtermRef.current?.write(data);
          else nativeRef.current?.write(data);
        },
        onPostConnectionSetup: () => handlePostConnectionSetup(),
        onTmuxSessions: (sessions) =>
          setTmuxPick({
            relay: true,
            sessions: sessions.map((s) => ({
              name: s.name,
              windows: s.windows,
              attached: s.attachedClients,
              activity: s.lastActivity,
            })),
          }),
        onDisconnected: (hostName) => {
          showToast.warning(`Disconnected from ${hostName}`);
          onClose?.();
        },
      },
    );
    connRef.current = conn;

    const isConnecting = state.status === "connecting";
    const isConnected = state.status === "connected";
    const hasReceivedData = isConnected && state.hasData;
    const isDialogOpen = state.status === "prompt";

    const runStartupRef = useRef(runStartup);
    runStartupRef.current = runStartup;
    useEffect(() => {
      if (!hasReceivedData || !startupPending.current) return;
      startupPending.current = false;
      const timer = setTimeout(() => void runStartupRef.current(), 300);
      return () => clearTimeout(timer);
    }, [hasReceivedData]);
    const failed = state.status === "failed" ? state : null;

    // A new connection gets a fresh terminal view.
    const [viewKey, setViewKey] = useState(0);
    const firstConn = useRef(true);
    useEffect(() => {
      if (firstConn.current) {
        firstConn.current = false;
        return;
      }
      connectedOnce.current = false;
      sizeRef.current = null;
      setViewKey((k) => k + 1);
    }, [conn]);

    const handleResize = useCallback((cols: number, rows: number) => {
      sizeRef.current = { cols, rows };
      if (!connectedOnce.current) {
        connectedOnce.current = true;
        connRef.current?.connect(cols, rows);
      } else {
        connRef.current?.resize(cols, rows);
      }
    }, []);

    const handleFontSize = useCallback(
      (size: number) => {
        // The view reports the drawn size; keep the base size the user picked.
        const base = Math.round((size / Math.max(1, fontScale)) * 2) / 2;
        if (base !== settings.fontSize) updateFontSize(base).catch(() => {});
      },
      [fontScale, settings.fontSize, updateFontSize],
    );

    // Find in the terminal, opened by a key row key, the menu or Ctrl+F.
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchResult, setSearchResult] = useState<TerminalSearchResult>({
      total: 0,
      index: -1,
    });
    const closeSearch = useCallback(() => {
      setSearchOpen(false);
      setSearchResult({ total: 0, index: -1 });
      nativeRef.current?.clearSearch();
    }, []);
    const { layout: keyLayout } = useKeyLayout(host);
    const tmuxPrefix = controlCode(keyLayout.tmuxPrefix || "b");
    const openTmuxWindows = useCallback(async () => {
      // Only a phone shell can list them; through the server, tmux's own chooser.
      if (transportRef.current !== "local") {
        connRef.current?.sendInput(`${tmuxPrefix}w`);
        return;
      }
      const found = await connRef.current
        ?.exec(listWindowsCommand(), 10)
        .catch(() => null);
      const all = parseWindows(found?.stdout ?? "");
      const session = tmuxSessionRef.current;
      const mine = session ? all.filter((w) => w.session === session) : all;
      if (mine.length === 0) {
        showToast.info("No tmux windows found");
        return;
      }
      setTmuxWindows(mine);
    }, [tmuxPrefix]);
    const runCommand = useCallback(
      (id: string) => {
        if (id === "tmux.windows") {
          void openTmuxWindows();
          return true;
        }
        if (XTERM_FALLBACK) return false;
        if (id === "search") {
          setSearchOpen(true);
          return true;
        }
        return false;
      },
      [openTmuxWindows],
    );

    const modifiersRef = useRef<ModifierState>({
      ctrl: "inactive",
      alt: "inactive",
    });
    const modifierListeners = useRef(new Set<() => void>());
    const handleModifiers = useCallback((next: ModifierState) => {
      modifiersRef.current = next;
      modifierListeners.current.forEach((l) => l());
    }, []);

    const keyTarget = useMemo<TerminalKeyTarget>(
      () => ({
        focus: () => nativeRef.current?.focus(),
        blur: () => nativeRef.current?.blur(),
        sendKey: (name, shift) =>
          nativeRef.current?.sendKey(name as never, shift),
        typeText: (text) => nativeRef.current?.typeText(text),
        paste: (text) => nativeRef.current?.paste(text),
        toggleModifier: (name) => nativeRef.current?.toggleModifier(name),
        modifiers: () =>
          modifiersRef.current as {
            ctrl: StickyModifierState;
            alt: StickyModifierState;
          },
        subscribeModifiers: (listener) => {
          modifierListeners.current.add(listener);
          return () => modifierListeners.current.delete(listener);
        },
      }),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        sendInput,
        fit: () => {
          // The native view follows its own size.
          if (XTERM_FALLBACK) xtermRef.current?.fit();
        },
        isDialogOpen: () => isDialogOpen,
        notifyBackgrounded: () => connRef.current?.notifyBackgrounded(),
        notifyForegrounded: () => connRef.current?.notifyForegrounded(),
        scrollToBottom: () => {
          if (XTERM_FALLBACK) xtermRef.current?.scrollToBottom();
          else nativeRef.current?.scrollToBottom();
        },
        isSelecting: () =>
          XTERM_FALLBACK ? (xtermRef.current?.isSelecting() ?? false) : false,
        keyTarget: () => (XTERM_FALLBACK ? null : keyTarget),
        command: runCommand,
      }),
      [isDialogOpen, sendInput, keyTarget, runCommand],
    );

    const background = settings.colors.background;

    return (
      <View
        style={{
          flex: isVisible ? 1 : 0,
          width: "100%",
          height: "100%",
          position: isVisible ? "relative" : "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: background,
        }}
      >
        <View
          style={{
            flex: 1,
            opacity: isVisible ? 1 : 0,
            zIndex: isVisible ? 1 : -1,
            backgroundColor: background,
          }}
        >
          <View
            style={{ flex: 1, backgroundColor: background }}
            pointerEvents={isDialogOpen ? "none" : "auto"}
          >
            {XTERM_FALLBACK ? (
              <XtermTerminalView
                key={`xterm-${hostConfig.id}-${viewKey}`}
                ref={xtermRef}
                config={{
                  ...MOBILE_DEFAULT_TERMINAL_CONFIG,
                  ...config,
                  ...hostConfig.terminalConfig,
                }}
                colors={settings.colors}
                fontFamily={settings.fontFamily}
                fontSize={settings.fontSize}
                hasData={hasReceivedData}
                onReady={handleResize}
                onResize={handleResize}
                onInput={(data) => connRef.current?.sendInput(data)}
                onFailure={(message) => {
                  showToast.error(message);
                  onClose?.();
                }}
              />
            ) : (
              <View style={{ flex: 1, opacity: hasReceivedData ? 1 : 0 }}>
                <TerminalView
                  key={`native-${hostConfig.id}-${viewKey}`}
                  ref={nativeRef}
                  settings={settings}
                  pipeId={pipeId}
                  onInput={sendInput}
                  onResize={handleResize}
                  onModifiers={handleModifiers}
                  onFontSize={handleFontSize}
                  showScrollButton={isVisible && isConnected && !isDialogOpen}
                  watchPrompt={isConnected && (fillOn || historyOn)}
                  onPromptLine={(line) => watcherRef.current?.line(line)}
                  onSearch={setSearchResult}
                  onTitle={useShellTitle ? onTitle : undefined}
                  onMenu={onMenu}
                />
                {searchOpen && isVisible ? (
                  <SearchBar
                    result={searchResult}
                    onSearch={(query, options) => {
                      if (query) nativeRef.current?.search(query, options);
                      else {
                        nativeRef.current?.clearSearch();
                        setSearchResult({ total: 0, index: -1 });
                      }
                    }}
                    onStep={(forward) =>
                      forward
                        ? nativeRef.current?.searchNext()
                        : nativeRef.current?.searchPrevious()
                    }
                    onClose={closeSearch}
                  />
                ) : null}
                {suggestionsOn && isVisible && isConnected ? (
                  <SuggestionStrip
                    tracker={tracker}
                    history={history}
                    onPick={(rest) => sendInput(rest)}
                  />
                ) : null}
              </View>
            )}
          </View>

          {/* Spinner shown until terminal has rendered its first output */}
          {!hasReceivedData && !failed && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: background,
                zIndex: 120,
              }}
            >
              <ActivityIndicator size="large" color={ui.brand} />
              <Text
                style={{
                  color: ui.text,
                  fontSize: 16,
                  fontWeight: "600",
                  marginTop: 20,
                  textAlign: "center",
                  letterSpacing: 0.3,
                }}
              >
                {state.status === "connecting" && state.retry > 0
                  ? "Reconnecting..."
                  : state.status === "prompt"
                    ? "Waiting for you..."
                    : "Connecting..."}
              </Text>
              <Text
                style={{
                  color: ui.textMuted,
                  fontSize: 13,
                  marginTop: 6,
                  textAlign: "center",
                }}
              >
                {hostConfig.name}
                {"  |  "}
                {hostConfig.ip}
              </Text>
            </View>
          )}

          {failed ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 130,
              }}
            >
              <ConnectionError
                failure={failed.failure}
                switchTo={switchTo}
                onRetry={() => void conn.retry()}
                onSwitch={switchOrigin}
                onClose={onClose}
              />
            </View>
          ) : (
            <ConnectionLog
              entries={log}
              isConnecting={isConnecting}
              isConnected={isConnected}
              hasConnectionError={false}
              onClear={conn.clearLog}
            />
          )}
        </View>

        <TmuxPickerSheet
          sessions={tmuxPick?.sessions ?? null}
          allowPlain={!tmuxPick?.relay}
          onPick={onTmuxPick}
        />
        <TmuxWindowsSheet
          windows={tmuxWindows}
          onClose={() => setTmuxWindows(null)}
          onNew={() => {
            setTmuxWindows(null);
            connRef.current?.sendInput(`${tmuxPrefix}c`);
          }}
          onPick={(w) => {
            setTmuxWindows(null);
            connRef.current?.sendInput(tmuxPrefix + selectWindowKeys(w.index));
          }}
        />

        <PasswordFillSheet
          ask={fillAsk}
          hostName={hostConfig.name || hostConfig.ip}
          onChoose={onFillChoice}
        />

        <ConnectionPrompts
          conn={conn}
          state={state}
          hostInfo={{
            name: hostConfig.name,
            ip: hostConfig.ip,
            port: hostConfig.port,
            username: hostConfig.username,
          }}
        />
      </View>
    );
  },
);

TerminalComponent.displayName = "Terminal";

export { TerminalComponent as Terminal };
export default TerminalComponent;

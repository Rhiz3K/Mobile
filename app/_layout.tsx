import { useEffect } from "react";
import { Stack } from "expo-router";
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from "expo-screen-capture";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { TerminalSessionsProvider } from "@/contexts/TerminalSessionsContext";
import { TerminalCustomizationProvider } from "@/contexts/TerminalCustomizationContext";
import { KeyboardProvider } from "@/contexts/KeyboardContext";
import { KeyPrefsProvider } from "@/features/terminal/keys/KeyPrefsContext";
import {
  ThemeProvider,
  useTheme,
  useThemeColor,
} from "@/contexts/ThemeContext";
import { AppLockProvider, useAppLock } from "@/contexts/AppLockContext";
import { LockScreen } from "@/components/LockScreen";
import LinkFlow from "@/screens/link/LinkFlow";
import { AnalyticsHost } from "@/screens/analytics/ConsentPrompt";
import Welcome from "@/screens/onboarding/Welcome";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Toaster } from "@/ui/Toast";
import { ConfirmProvider } from "@/ui/Confirm";
import { SudoPromptHost } from "@/screens/exec/SudoPromptHost";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { FONT_MAP, MONO_FONT, MONO_FONT_BOLD } from "@/constants/fonts";
import "../global.css";
import UpdateRequired from "@/screens/authentication/UpdateRequired";
import { WidgetDeepLinkHost, useWidgetSync } from "@/widgets";
import { loadUiPrefs } from "@/core/ui-prefs";
import { registerBuiltInFeatures } from "@/features";
import { usePluginFrameFeatures } from "@/features/plugin-webview/register";
import { AccountSwitcher } from "@/screens/accounts/AccountSwitcher";
import { ProxyGateHost } from "@/screens/accounts/ProxyGateHost";
import { ShortcutSheet } from "@/screens/shortcuts/ShortcutSheet";
import { useAppShortcuts } from "@/core/shortcuts/useAppShortcuts";
import { CommandPalette } from "@/screens/palette/CommandPalette";
import { LabLaunch } from "@/screens/dev/terminal-lab/LabLaunch";
// Defines the background sync task, which must exist when the app loads.
import "@/core/sync/background";

registerBuiltInFeatures();

function RootLayoutContent() {
  const {
    authFlowVisible,
    welcomeVisible,
    finishWelcome,
    showUpdateScreen,
    isLoading,
    setIsLoading,
  } = useAppContext();
  const accent = useThemeColor()("accent-brand");
  usePluginFrameFeatures();
  useAppShortcuts();
  useWidgetSync();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={accent} />
        <Text
          className="mt-4 text-base text-foreground"
          style={{ fontFamily: MONO_FONT }}
        >
          Initializing…
        </Text>
        <TouchableOpacity
          onPress={() => setIsLoading(false)}
          className="mt-6 border border-border bg-card px-6 py-3"
        >
          <Text
            className="text-foreground"
            style={{ fontFamily: MONO_FONT_BOLD }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showUpdateScreen) return <UpdateRequired />;

  // The tab shell always renders once loaded. When the user isn't connected,
  // the tabs themselves show a "no server connected" empty state. The auth flow
  // is layered on top as a dismissible full-screen overlay.
  return (
    <View className="flex-1 bg-background">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      {/* Home-screen widget taps: session navigation and the snippet run
          sheet. Mounted here so it is active for the whole session, including
          cold starts from a widget. */}
      <WidgetDeepLinkHost />
      <LabLaunch />
      <CommandPalette />
      <ShortcutSheet />
      <AccountSwitcher />
      <ProxyGateHost />
      <AppLockGate />
      <AnalyticsHost hold={welcomeVisible || authFlowVisible} />
      {welcomeVisible ? (
        <View className="absolute inset-0 bg-background">
          <Welcome onDone={finishWelcome} />
        </View>
      ) : null}
      {authFlowVisible ? (
        <View className="absolute inset-0 bg-background">
          <LinkFlow />
        </View>
      ) : null}
    </View>
  );
}

function AppLockGate() {
  const { enabled, locked, covered, hideInSwitcher } = useAppLock();
  // Android hides the recents thumbnail with the secure flag; iOS uses the cover below.
  const secure = enabled && hideInSwitcher && Platform.OS === "android";
  useEffect(() => {
    if (!secure) return;
    preventScreenCaptureAsync("termix-lock").catch(() => {});
    return () => {
      allowScreenCaptureAsync("termix-lock").catch(() => {});
    };
  }, [secure]);
  if (!enabled) return null;
  if (locked) return <LockScreen />;
  if (covered) return <View className="absolute inset-0 z-50 bg-background" />;
  return null;
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_MAP);
  useEffect(() => {
    loadUiPrefs().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedStatusBar />
          {!fontsLoaded ? (
            <View className="flex-1 bg-background" />
          ) : (
            <AppLockProvider>
              <AppProvider>
                <TerminalSessionsProvider>
                  <TerminalCustomizationProvider>
                    <KeyboardProvider>
                      <KeyPrefsProvider>
                        <ConfirmProvider>
                          <RootLayoutContent />
                        </ConfirmProvider>
                        <SudoPromptHost />
                        <Toaster />
                      </KeyPrefsProvider>
                    </KeyboardProvider>
                  </TerminalCustomizationProvider>
                </TerminalSessionsProvider>
              </AppProvider>
            </AppLockProvider>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

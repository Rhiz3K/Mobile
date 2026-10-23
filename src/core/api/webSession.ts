import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccountClient } from "./AccountClient";

// Behind a reverse-proxy auth gate (e.g. Pangolin) the sign-in WebView keeps the
// proxy's session cookie, so the next sign-in would skip the proxy login. We
// reset it with pure JS (no native cookie module / no rebuild): flag that the
// next sign-in WebView must use an ephemeral (incognito) cookie store, which
// starts with no proxy cookie and therefore shows the proxy login again.
const FRESH_WEBVIEW_SESSION_KEY = "freshWebViewSession";

export async function requestFreshWebSession(): Promise<void> {
  try {
    await AsyncStorage.setItem(FRESH_WEBVIEW_SESSION_KEY, "1");
  } catch {
    // Non-fatal: worst case the WebView reuses the previous proxy session.
  }
}

export async function consumeFreshWebSession(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(FRESH_WEBVIEW_SESSION_KEY);
    if (v) {
      await AsyncStorage.removeItem(FRESH_WEBVIEW_SESSION_KEY);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Full session reset: token + force a fresh (incognito) proxy login next time. */
export async function clearSession(
  client: AccountClient | null,
): Promise<void> {
  await client?.clearToken();
  await requestFreshWebSession();
}

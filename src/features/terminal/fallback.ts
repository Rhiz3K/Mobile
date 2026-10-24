import { isTerminalEngineAvailable } from "@/modules/termix-terminal";

/**
 * The old xterm terminal in a web view. Kept for one beta behind a build flag, and used where
 * the native engine is missing (Expo Go, web, 32 bit Android).
 */
export function shouldUseXterm(
  env: string | undefined = process.env.EXPO_PUBLIC_XTERM_FALLBACK,
  engine = isTerminalEngineAvailable,
): boolean {
  return env === "1" || !engine;
}

export const XTERM_FALLBACK = shouldUseXterm();

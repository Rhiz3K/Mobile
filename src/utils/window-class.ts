import { useWindowDimensions } from "react-native";

export type WindowClass = "compact" | "medium" | "expanded";

/** Width where tablet layouts start (sidebar, split view, companions). */
export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;
/** Smallest screen side that gets split view. */
export const SPLIT_MIN_SIDE = 600;

export type WindowInfo = {
  width: number;
  height: number;
  windowClass: WindowClass;
  isLandscape: boolean;
  isPortrait: boolean;
  /** Wide enough for the sidebar and master/detail layouts. */
  isWide: boolean;
  /** Both sides big enough for two panes. */
  canSplit: boolean;
  /** Short window, like a phone in landscape. */
  isShort: boolean;
};

export function windowClassFor(width: number): WindowClass {
  if (width >= EXPANDED_MIN_WIDTH) return "expanded";
  if (width >= MEDIUM_MIN_WIDTH) return "medium";
  return "compact";
}

export function windowInfo(width: number, height: number): WindowInfo {
  const windowClass = windowClassFor(width);
  const isLandscape = width > height;
  return {
    width,
    height,
    windowClass,
    isLandscape,
    isPortrait: !isLandscape,
    isWide: windowClass !== "compact",
    canSplit: Math.min(width, height) >= SPLIT_MIN_SIDE,
    isShort: height < 500,
  };
}

/** The one source of truth for layout breakpoints. Follows fold and window resizes. */
export function useWindowInfo(): WindowInfo {
  const { width, height } = useWindowDimensions();
  return windowInfo(width, height);
}

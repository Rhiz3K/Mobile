import type { StyleProp, ViewStyle } from "react-native";

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  /** ANSI 0 to 15. */
  palette: string[];
}

export interface TerminalStats {
  /** Frames the engine drew. Android only. */
  renderedFrames?: number;
  /** Time spent drawing one frame. Android only. */
  renderMsP50?: number;
  renderMsP95?: number;
  renderMsMax?: number;
  /** Pty output fed in since the view was created. */
  bytesParsed?: number;
}

export interface TerminalViewProps {
  /**
   * Base size in points. Pinch zoom steps from it. On iOS a change after
   * mount rebuilds the surface and clears the screen.
   */
  fontSize: number;
  /** On iOS the theme and font are shared by every terminal view. */
  theme: TerminalTheme;
  /** Bytes the user typed or the terminal answered, base64. */
  onInput: (base64: string) => void;
  onResize: (cols: number, rows: number) => void;
  onBell?: () => void;
  onTitle?: (title: string) => void;
  style?: StyleProp<ViewStyle>;
}

export interface TerminalViewHandle {
  /** Feed pty output, base64. Calls before the first resize are queued. */
  write(base64: string): void;
  /** Bracketed when the program asks for it. */
  paste(text: string): void;
  scrollToBottom(): void;
  copySelection(): void;
  /** Shows the keyboard. */
  focus(): void;
  blur(): void;
  getStats(): Promise<TerminalStats | null>;
}

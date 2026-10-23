import { TERMINAL_THEMES } from "@/constants/terminal-themes";

// Every engine the lab runs takes the module's props and handle, so the lab
// can swap them and feed each the same bytes.
import type {
  TerminalStats,
  TerminalTheme,
  TerminalViewHandle,
  TerminalViewProps,
} from "@/modules/termix-terminal";

export type SurfaceTheme = TerminalTheme;
export type EngineStats = TerminalStats;
export type TerminalSurfaceProps = TerminalViewProps;
export type TerminalSurfaceHandle = TerminalViewHandle;

export const LAB_FONT_FAMILY = "CaskaydiaCove NFM";

export function surfaceTheme(name = "termix"): SurfaceTheme {
  const c = (TERMINAL_THEMES[name] ?? TERMINAL_THEMES.termix).colors;
  return {
    background: c.background,
    foreground: c.foreground,
    cursor: c.cursor ?? c.foreground,
    selectionBackground: c.selectionBackground ?? "#3a3a3d",
    palette: [
      c.black,
      c.red,
      c.green,
      c.yellow,
      c.blue,
      c.magenta,
      c.cyan,
      c.white,
      c.brightBlack,
      c.brightRed,
      c.brightGreen,
      c.brightYellow,
      c.brightBlue,
      c.brightMagenta,
      c.brightCyan,
      c.brightWhite,
    ],
  };
}

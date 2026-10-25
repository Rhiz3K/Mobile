import type { WindowInfo } from "@/utils/window-class";

/** Where navigation goes and whether the host list sits beside sessions. */
export function shellLayout(
  win: Pick<WindowInfo, "windowClass">,
  open: number,
) {
  return {
    nav:
      win.windowClass === "compact" ? ("bottom" as const) : ("side" as const),
    hostsPane: win.windowClass === "expanded" && open > 0,
  };
}

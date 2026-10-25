import { windowInfo } from "@/utils/window-class";

const MIN_RATIO = 0.3;
const MAX_RATIO = 0.7;

export function canSplit(width: number, height: number): boolean {
  return windowInfo(width, height).canSplit;
}

/** The tab shown beside the active one, or null when it is gone or the same. */
export function splitPartner(
  ids: string[],
  activeId: string | null,
  splitWith: string | null,
): string | null {
  if (!splitWith || !activeId || splitWith === activeId) return null;
  return ids.includes(splitWith) && ids.includes(activeId) ? splitWith : null;
}

/** Split partner after a tab becomes active: tapping the partner swaps the two. */
export function partnerAfterActivate(
  activeId: string | null,
  splitWith: string | null,
  nextId: string,
): string | null {
  if (!splitWith) return null;
  if (nextId === splitWith) return activeId;
  return splitWith;
}

export function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

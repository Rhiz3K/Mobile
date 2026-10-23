import { api } from "@/core/accounts";

let cachedUserId: string | null = null;

/**
 * The current authenticated user's id, used as `userId` on session-based
 * connect/file/docker calls (the backend ties activity + data unlock to it).
 * Cached after the first lookup; cleared on logout via `clearCachedUserId`.
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  try {
    const info = await api().auth.getUserInfo();
    cachedUserId = info?.userId || null;
    return cachedUserId;
  } catch {
    return null;
  }
}

export function clearCachedUserId(): void {
  cachedUserId = null;
}

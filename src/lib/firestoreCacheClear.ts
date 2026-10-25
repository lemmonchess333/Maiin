/**
 * Clearing this device's copy of Firestore after a sign-out.
 *
 * The persistent cache (firebase.ts) keeps every document the account
 * read: its profile, meals, workouts, the GPS points of its runs. Firestore
 * does not partition that cache by account and does not apply the security
 * rules to it, and signing out left it all in IndexedDB, where the next
 * person on a shared browser could read it from the developer tools.
 *
 * Firestore can only clear its cache while nothing is using it, so a
 * sign-out that clears marks the cache here and reloads, and the next boot
 * clears it before anything opens it (firebase.ts). The mark is consumed by
 * that very boot, so nobody can have used the cache in between.
 *
 * Clearing also drops writes that have not reached the server yet, so the
 * sign-out clears only when there are none: online, and once this
 * account's pending writes have been acknowledged within a few seconds.
 * Offline it keeps the cache, and the writes go up when the account next
 * signs in on this device.
 *
 * Its own module with no Firestore import, because Login loads auth.tsx and
 * must not load the Firestore SDK (eagerGraph.test.ts).
 */
import { readString, remove, writeString } from "./localStore";

const MARK = "tropos.clear-firestore-cache";

/** How long a sign-out waits for this account's writes to be acknowledged. */
export const WRITES_SETTLE_MS = 4000;

/**
 * Whether this account has no writes left to send: true once `wait` (the
 * SDK's waitForPendingWrites) resolves within `timeoutMs`, false offline,
 * on a timeout, or if it fails.
 */
export async function writesSettled(
  wait: () => Promise<void>,
  {
    online = typeof navigator === "undefined" ? true : navigator.onLine,
    timeoutMs = WRITES_SETTLE_MS,
  }: { online?: boolean; timeoutMs?: number } = {}
): Promise<boolean> {
  if (!online) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([wait().then(() => true as const), timedOut]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the next boot to clear the cache. */
export function markFirestoreCacheForClearing(): void {
  writeString(MARK, "1");
}

/** Whether this boot should clear the cache; consumes the mark. */
export function takeFirestoreCacheClearMark(): boolean {
  const marked = readString(MARK) === "1";
  if (marked) remove(MARK);
  return marked;
}

/** The reload a clearing sign-out ends with. A function so tests can see it. */
export function reloadToClearFirestoreCache(): void {
  markFirestoreCacheForClearing();
  window.location.reload();
}

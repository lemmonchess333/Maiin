/**
 * The badges waiting to be revealed on this device, and which it has
 * queued before.
 *
 * Every badge is awarded by the server (App1 Q33, functions/lib/
 * badgeAwards.js), so the reveal is fed by its record: an earned entry of
 * `streaks/data.badges` that names the session that earned it (`earnedBy`,
 * which only the server's award writes) and was earned within the window
 * is queued here, once per badge per device, whenever the record is read.
 * A badge earned offline, on another phone, or while the app was closed is
 * revealed the next time this app reads the record; one this device has
 * queued is never queued again, so a dismissed reveal stays dismissed. The
 * queue is opened from Home's new-badge row, never over Home by itself.
 *
 * A badge earned before the server awarded them carries no `earnedBy`: it
 * was revealed, or not, as it was then, and is never queued here. On the
 * device rather than on the badge, as medals are (`medalReveals.ts`): a
 * field the client could set on the badge would need a rule of its own,
 * and the window bounds what a new phone or a reinstall replays.
 */
import { readJson, writeJson, scopedKey } from "@/lib/localStore";

/** How long after its award a badge is still revealed on a device that has
 *  not shown it. The medals' window (`MEDAL_REVEAL_WINDOW_DAYS`). */
export const BADGE_REVEAL_WINDOW_DAYS = 14;

const cache = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();
const EMPTY: readonly string[] = [];
type RevealList = "pendingBadgeReveals" | "badgeRevealsQueued";
const keyFor = (uid: string) => scopedKey("pendingBadgeReveals", uid);
const queuedKeyFor = (uid: string) => scopedKey("badgeRevealsQueued", uid);

/** One of the account's two lists on this device, each under its own uid. */
function readIds(list: RevealList, uid: string): string[] {
  const key = scopedKey(list, uid);
  const stored = readJson<unknown>(key, []);
  return Array.isArray(stored)
    ? [...new Set(stored.filter((id): id is string => typeof id === "string"))]
    : [];
}

export function pendingBadgeIds(uid: string | null): readonly string[] {
  if (!uid) return EMPTY;
  if (!cache.has(uid)) cache.set(uid, readIds("pendingBadgeReveals", uid));
  return cache.get(uid)!;
}

export function subscribePendingBadges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function save(uid: string, ids: readonly string[]) {
  writeJson(keyFor(uid), ids);
  cache.set(uid, ids);
  listeners.forEach((listener) => listener());
}

/**
 * The ids in a stored `badges` array the server awarded within the
 * window: earned, naming `earnedBy`, at a parseable time no older than
 * BADGE_REVEAL_WINDOW_DAYS.
 */
function serverAwardsToReveal(
  stored: unknown,
  nowMs: number = Date.now()
): string[] {
  if (!Array.isArray(stored)) return [];
  const windowMs = BADGE_REVEAL_WINDOW_DAYS * 86_400_000;
  const ids: string[] = [];
  for (const entry of stored) {
    if (!entry || typeof entry !== "object") continue;
    const { id, earnedAt, earnedBy } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof earnedAt !== "string") continue;
    if (!earnedBy || typeof earnedBy !== "object") continue;
    const at = Date.parse(earnedAt);
    if (!Number.isFinite(at) || nowMs - at > windowMs) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Queue the server's new awards in a stored `badges` array for the reveal,
 * each once per device: an id this device has queued before is left out,
 * whether its reveal is still waiting or was dismissed.
 */
export function queueServerAwards(
  uid: string,
  stored: unknown,
  nowMs: number = Date.now()
): void {
  const fresh = serverAwardsToReveal(stored, nowMs);
  if (fresh.length === 0) return;
  const queued = new Set(readIds("badgeRevealsQueued", uid));
  const add = fresh.filter((id) => !queued.has(id));
  if (add.length === 0) return;
  writeJson(queuedKeyFor(uid), [...queued, ...add]);
  save(uid, [...new Set([...pendingBadgeIds(uid), ...add])]);
}

export function dismissBadgeReveal(uid: string, id: string) {
  save(
    uid,
    pendingBadgeIds(uid).filter((pending) => pending !== id)
  );
}

/**
 * useHiddenActivities — per-device set of feed-item activity IDs the
 * user has chosen to hide via the report modal's "Hide from feed"
 * checkbox (locked decision S4c).
 *
 * Persistence: localStorage, scoped by Firebase Auth UID so two users
 * on the same device don't share hidden sets. Cross-device sync is
 * intentionally deferred — the spec calls this a "user-controlled,
 * immediate" action; persisting to Firestore would add latency +
 * require a rule for /users/{uid}/hiddenActivities and adds a server
 * dependency without a meaningful UX win at small scale. If demand
 * for cross-device sync emerges, this hook can mirror writes to
 * Firestore without changing the consumer contract.
 *
 * Shape:
 *   hidden     — Set<string> of activity IDs currently hidden
 *   hide(id)   — add to the set + persist
 *   unhide(id) — remove + persist (no UI surface yet; reserved for a
 *                future "Show hidden activities" affordance in Settings)
 *
 * Subscribes to the localStorage `storage` event so writes from
 * another tab on the same UID propagate without page reload. Built
 * on `useSyncExternalStore` so React stays in sync with the external
 * store without setState-in-effect anti-patterns.
 */
import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";

function storageKey(uid: string): string {
  return `tropos.hiddenActivities.${uid}`;
}

function readSet(uid: string | null): Set<string> {
  if (!uid || typeof window === "undefined") return EMPTY_SET;
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return EMPTY_SET;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_SET;
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return EMPTY_SET;
  }
}

function writeSet(uid: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify(Array.from(set)));
  } catch {
    // Quota or disabled — swallow.
  }
  // Notify same-tab subscribers (storage event only fires cross-tab).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tropos:hidden-activities-changed"));
  }
}

const EMPTY_SET: Set<string> = new Set();

// Memoised snapshot per uid — required by useSyncExternalStore so
// successive getSnapshot() calls return the same reference unless
// the underlying data changed. Without this, every render would
// produce a new Set instance and trigger an infinite re-render loop.
const snapshotCache = new Map<string, Set<string>>();

function getSnapshot(uid: string | null): Set<string> {
  if (!uid) return EMPTY_SET;
  const fresh = readSet(uid);
  const cached = snapshotCache.get(uid);
  // Compare by content: same size + same members => return cached.
  if (cached && cached.size === fresh.size && [...fresh].every((id) => cached.has(id))) {
    return cached;
  }
  snapshotCache.set(uid, fresh);
  return fresh;
}

function subscribe(uid: string | null, callback: () => void): () => void {
  if (!uid || typeof window === "undefined") return () => {};
  const key = storageKey(uid);
  function onStorage(e: StorageEvent) {
    if (e.key === key) callback();
  }
  function onSameTab() {
    callback();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener("tropos:hidden-activities-changed", onSameTab);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("tropos:hidden-activities-changed", onSameTab);
  };
}

export interface UseHiddenActivitiesResult {
  hidden: Set<string>;
  hide: (activityId: string) => void;
  unhide: (activityId: string) => void;
}

export function useHiddenActivities(): UseHiddenActivitiesResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const hidden = useSyncExternalStore(
    useCallback((cb) => subscribe(uid, cb), [uid]),
    useCallback(() => getSnapshot(uid), [uid]),
    () => EMPTY_SET,
  );

  const hide = useCallback(
    (activityId: string) => {
      if (!uid) return;
      const current = readSet(uid);
      if (current.has(activityId)) return;
      const next = new Set(current);
      next.add(activityId);
      snapshotCache.delete(uid);
      writeSet(uid, next);
    },
    [uid],
  );

  const unhide = useCallback(
    (activityId: string) => {
      if (!uid) return;
      const current = readSet(uid);
      if (!current.has(activityId)) return;
      const next = new Set(current);
      next.delete(activityId);
      snapshotCache.delete(uid);
      writeSet(uid, next);
    },
    [uid],
  );

  return { hidden, hide, unhide };
}

import { readJson, writeJson, scopedKey } from "@/lib/localStore";

const cache = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();
const EMPTY: readonly string[] = [];
const keyFor = (uid: string) => scopedKey("pendingBadgeReveals", uid);

export function pendingBadgeIds(uid: string | null): readonly string[] {
  if (!uid) return EMPTY;
  if (!cache.has(uid)) {
    const stored = readJson<unknown>(keyFor(uid), []);
    cache.set(
      uid,
      Array.isArray(stored)
        ? [
            ...new Set(
              stored.filter((id): id is string => typeof id === "string")
            ),
          ]
        : []
    );
  }
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

export function queueBadgeReveals(uid: string, ids: readonly string[]) {
  save(uid, [...new Set([...pendingBadgeIds(uid), ...ids])]);
}

export function dismissBadgeReveal(uid: string, id: string) {
  save(
    uid,
    pendingBadgeIds(uid).filter((pending) => pending !== id)
  );
}

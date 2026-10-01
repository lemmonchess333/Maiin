import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useUid } from "@/lib/auth";
import { followUser, isFollowing, unfollowUser } from "@/lib/socialApi";
import { logger } from "@/lib/logger";

/**
 * Whether the signed-in person follows someone, shared by every control
 * that shows it: the Follow button on a profile or in People, the Follow
 * link on a post, the People to follow row.
 *
 * One read per (viewer, person) a session, however many controls show
 * that person, and a follow from any of them shows on all of them at
 * once. Keyed by viewer, so an account switch starts from nothing.
 */
type Known = "following" | "not-following" | "failed";

const states = new Map<string, Known>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

const keyOf = (viewer: string, target: string) => `${viewer}:${target}`;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Record what is already known without a read: a suggestion list holds
 *  only people the viewer doesn't follow, so its rows needn't ask. */
export function noteFollowState(
  viewer: string,
  target: string,
  following: boolean
): void {
  const key = keyOf(viewer, target);
  const next: Known = following ? "following" : "not-following";
  if (states.get(key) === next) return;
  states.set(key, next);
  emit();
}

function load(viewer: string, target: string) {
  const key = keyOf(viewer, target);
  if (states.has(key) || pending.has(key)) return;
  pending.add(key);
  isFollowing(viewer, target)
    .then((v) => {
      // A follow tapped while the read was out wins over the read.
      if (!states.has(key)) states.set(key, v ? "following" : "not-following");
    })
    .catch((err) => {
      logger.error("[followState] isFollowing check failed", err);
      if (!states.has(key)) states.set(key, "failed");
    })
    .finally(() => {
      pending.delete(key);
      emit();
    });
}

/** Test seam: forget everything (each test starts a fresh session). */
export function __resetFollowStatesForTests(): void {
  states.clear();
  pending.clear();
  emit();
}

export function useFollowState(targetUid: string) {
  const viewer = useUid();
  const key = viewer ? keyOf(viewer, targetUid) : null;
  const known = useSyncExternalStore(subscribe, () =>
    key ? states.get(key) : undefined
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!viewer || viewer === targetUid) return;
    load(viewer, targetUid);
  }, [viewer, targetUid]);

  /** Follow or unfollow, showing the new state at once and putting it
   *  back if the write fails. Resolves whether the write landed. */
  const toggle = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (!viewer || viewer === targetUid) return false;
      const key = keyOf(viewer, targetUid);
      const before = states.get(key);
      states.set(key, next ? "following" : "not-following");
      emit();
      setBusy(true);
      try {
        if (next) await followUser(viewer, targetUid);
        else await unfollowUser(viewer, targetUid);
        return true;
      } catch (err) {
        logger.error("[followState] toggle failed", err);
        if (before === undefined) states.delete(key);
        else states.set(key, before);
        emit();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [viewer, targetUid]
  );

  return {
    /** null until known, or when the check failed. */
    following:
      known === "following" ? true : known === "not-following" ? false : null,
    /** True once the check has answered, either way. */
    settled: known !== undefined,
    busy,
    toggle,
  };
}

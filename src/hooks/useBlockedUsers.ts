import { useState, useEffect, useCallback } from "react";
import { useUid } from "../lib/auth";
import { getBlockedUsers, subscribeBlockedBy } from "../lib/socialApi";
import { captureError } from "../lib/errorReporting";

/* Module-level cache + listener registry so multiple components
 * (Social.tsx for feed filtering + ActivityCard for the block CTA)
 * see the same blocked set and updates from one consumer flow into
 * the others.
 *
 * Blocking one person hides each from the other (S4, Polish3 call 1), so
 * the set every surface filters on, `blocked`, holds both directions:
 * the people this account blocked (`blocks/{uid}/users`, its own list,
 * read once and then kept by addBlocked / removeBlocked) and the people
 * who blocked it (`blockedBy/{uid}/users`, the server's copy, read live
 * because it changes on someone else's say). `youBlocked` is the first
 * half alone, for the Unblock controls; `blockedYou` the second, for the
 * profile that is not available.
 *
 * addBlocked publishes a fresh Set to every subscriber so feed-hook deps
 * re-fire and filter the user out within the next loadFeed cycle. Each
 * set keeps its identity until its contents change: feed hooks depend on
 * it, and a new Set every render would refetch every render. */
const cache = new Map<string, Set<string>>();
/* SOCIAL-PRIVACY-01 — readiness ledger, keyed by uid. A uid lands here
 * once its initial getBlockedUsers has SETTLED (resolved or rejected).
 * Distinct from `cache` having an empty Set: pre-fetch, `blocked` is
 * empty because we don't KNOW the blocks yet, not because there are
 * none. Feed/Find reads gate on `ready` so a blocked user's content
 * can't flash before the block list is known. On fetch failure we still
 * mark ready (fail-open) so a transient block-list error doesn't wedge
 * the feed forever — the server visibility rules remain the hard gate. */
const readyCache = new Set<string>();
/* Who blocked each account, its readiness (first snapshot delivered, or
 * the listener failed, fail-open as above), and the one live listener per
 * uid, torn down when its last consumer unmounts. */
const blockedByCache = new Map<string, Set<string>>();
const blockedByReady = new Set<string>();
const blockedBySubscriptions = new Map<string, () => void>();
/* Both directions in one Set, built on first read after a change. */
const mergedCache = new Map<string, Set<string>>();
/* Listeners are no-arg force-render bumps. The blocked Sets themselves
 * live only in the caches; consumers read from them during render and
 * use these listeners to know when to re-render after a mutation. */
const listeners = new Map<string, Set<() => void>>();
const EMPTY = new Set<string>();

function notify(uid: string) {
  mergedCache.delete(uid);
  listeners.get(uid)?.forEach((fn) => fn());
}

function mergedFor(uid: string): Set<string> {
  let merged = mergedCache.get(uid);
  if (!merged) {
    merged = new Set([
      ...(cache.get(uid) ?? []),
      ...(blockedByCache.get(uid) ?? []),
    ]);
    // Never hidden from yourself, whatever a block of yourself says.
    merged.delete(uid);
    mergedCache.set(uid, merged);
  }
  return merged;
}

function reportFailure(e: unknown) {
  captureError(e instanceof Error ? e : new Error(String(e)), "network", {
    hook: "useBlockedUsers",
  });
}

function ensureBlockedBySubscribed(uid: string) {
  if (blockedBySubscriptions.has(uid)) return;
  /* Fail-open but READY, like the block list: a failed listener must not
     wedge the feed, and the rules still refuse a blocker's profile and
     posts read one at a time. The listener is dead after an error, so it
     is forgotten and the next consumer to mount starts another. */
  let live = true;
  const failed = (e: unknown) => {
    live = false;
    blockedBySubscriptions.delete(uid);
    if (!blockedByCache.has(uid)) blockedByCache.set(uid, new Set());
    blockedByReady.add(uid);
    notify(uid);
    reportFailure(e);
  };
  try {
    const unsubscribe = subscribeBlockedBy(
      uid,
      (ids) => {
        blockedByCache.set(uid, new Set(ids));
        blockedByReady.add(uid);
        notify(uid);
      },
      failed
    );
    if (live) blockedBySubscriptions.set(uid, unsubscribe);
  } catch (e) {
    failed(e);
  }
}

export interface UseBlockedUsersReturn {
  /** Everyone hidden from the signed-in person: whoever they blocked and
   *  whoever blocked them. What every surface filters on. */
  blocked: Set<string>;
  /** The people the signed-in person blocked, for the Unblock controls. */
  youBlocked: Set<string>;
  /** The people who blocked the signed-in person. Their profile reads as
   *  not available, and nothing tells the person why. */
  blockedYou: Set<string>;
  /** True once both lists have settled for this uid (loaded, or failed
   *  open). Gate Feed/Find reads on this. */
  ready: boolean;
  addBlocked: (uid: string) => void;
  removeBlocked: (uid: string) => void;
}

export function useBlockedUsers(): UseBlockedUsersReturn {
  const uid = useUid();
  /* Force-render counter. Listeners bump this when the cache mutates
     (addBlocked / removeBlocked / fetch resolution); the actual
     `blocked` value is derived from cache during render so we never
     need to setState synchronously inside the effect body. Same
     pattern other hooks in this codebase use to satisfy
     react-hooks/set-state-in-effect. */
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!uid) return;

    let bucket = listeners.get(uid);
    if (!bucket) {
      bucket = new Set();
      listeners.set(uid, bucket);
    }
    const force = () => setTick((t) => t + 1);
    bucket.add(force);

    /* Initial fetch on first settle for this uid. Keyed on the readiness
       ledger (not `cache`) so a pre-fetch addBlocked seed can't be
       mistaken for a completed load — readiness must reflect the server
       fetch settling. Already-settled uid requires no work. */
    if (!readyCache.has(uid)) {
      getBlockedUsers(uid)
        .then((ids) => {
          cache.set(uid, new Set(ids));
          readyCache.add(uid);
          notify(uid);
        })
        .catch((e) => {
          // Fail-open but READY: don't wedge the feed on a transient
          // block-list read error. Seed an empty set if none exists so
          // `blocked` stays a Set; server visibility rules still gate.
          if (!cache.has(uid)) cache.set(uid, new Set());
          readyCache.add(uid);
          notify(uid);
          reportFailure(e);
        });
    }

    ensureBlockedBySubscribed(uid);

    return () => {
      bucket?.delete(force);
      /* The last consumer gone: stop listening. The caches stay, so the
         next consumer renders the last known set while its own listener
         catches up. */
      if (bucket?.size === 0) {
        blockedBySubscriptions.get(uid)?.();
        blockedBySubscriptions.delete(uid);
      }
    };
  }, [uid]);

  // Derived during render. Pure; uid change → that uid's sets.
  const blocked = uid ? mergedFor(uid) : EMPTY;
  const youBlocked = uid ? (cache.get(uid) ?? EMPTY) : EMPTY;
  const blockedYou = uid ? (blockedByCache.get(uid) ?? EMPTY) : EMPTY;
  // Readiness is per-uid; without a signed-in user there's nothing to
  // gate (feeds don't load), so treat as not-ready.
  const ready: boolean = uid
    ? readyCache.has(uid) && blockedByReady.has(uid)
    : false;

  const addBlocked = useCallback(
    // `target` (was `uid`) — the account being blocked. It must not shadow the
    // signed-in `uid`, which is the CACHE KEY: pre-`useUid` this body reached
    // past the shadow via `user.uid`.
    (target: string) => {
      if (!uid) return;
      const next = new Set<string>(cache.get(uid) ?? []);
      next.add(target);
      cache.set(uid, next);
      notify(uid);
    },
    [uid]
  );

  const removeBlocked = useCallback(
    // `target` (was `uid`) — the account being blocked. It must not shadow the
    // signed-in `uid`, which is the CACHE KEY: pre-`useUid` this body reached
    // past the shadow via `user.uid`.
    (target: string) => {
      if (!uid) return;
      const next = new Set<string>(cache.get(uid) ?? []);
      next.delete(target);
      cache.set(uid, next);
      notify(uid);
    },
    [uid]
  );

  return { blocked, youBlocked, blockedYou, ready, addBlocked, removeBlocked };
}

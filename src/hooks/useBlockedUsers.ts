import { useState, useEffect, useCallback } from "react";
import { useUid } from "../lib/auth";
import { getBlockedUsers } from "../lib/socialApi";
import { captureError } from "../lib/errorReporting";

/* Module-level cache + listener registry so multiple components
 * (Social.tsx for feed filtering + ActivityCard for the block CTA)
 * see the same blocked set and updates from one consumer flow into
 * the others.
 *
 * Was previously a per-instance Set seeded by a one-shot getDocs;
 * blocking a user would write to Firestore but the visible feed
 * stayed populated with their posts because Social.tsx's instance
 * never received the update. addBlocked publishes a fresh Set to
 * every subscriber so feed-hook deps re-fire and filter the user
 * out within the next loadFeed cycle. */
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
/* Listeners are no-arg force-render bumps. The blocked Set itself
 * lives only in `cache`; consumers read from cache during render and
 * use these listeners to know when to re-render after a mutation. */
const listeners = new Map<string, Set<() => void>>();

function notify(uid: string) {
  listeners.get(uid)?.forEach((fn) => fn());
}

export interface UseBlockedUsersReturn {
  blocked: Set<string>;
  /** True once the initial block-list fetch for this uid has settled
   *  (resolved OR rejected). Gate Feed/Find reads on this. */
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
          captureError(
            e instanceof Error ? e : new Error(String(e)),
            "network",
            { hook: "useBlockedUsers" }
          );
        });
    }

    return () => {
      bucket?.delete(force);
    };
  }, [uid]);

  // Derived during render. Pure; uid change → empty set automatically.
  const blocked: Set<string> = uid ? (cache.get(uid) ?? new Set()) : new Set();
  // Readiness is per-uid; without a signed-in user there's nothing to
  // gate (feeds don't load), so treat as not-ready.
  const ready: boolean = uid ? readyCache.has(uid) : false;

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

  return { blocked, ready, addBlocked, removeBlocked };
}

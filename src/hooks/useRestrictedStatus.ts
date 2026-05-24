import { useEffect, useState } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { captureError } from "../lib/errorReporting";

/* S4e lock — restricted-user status hook.
 *
 * Reads `globalRestrictedUids/{uid}` for the current user and
 * surfaces { isRestricted, loading } reactively via onSnapshot.
 * Mirrors useBlockedUsers' module-level cache pattern so multiple
 * Find-tab consumers (search input, FollowButton, invite-share)
 * share the single listener.
 *
 * Per S4e P3 / lock-spec invariant: doc-absence = not-restricted.
 * Don't render a doc per non-restricted user — that would be 1M-
 * scale read amplification when virtually all users are not
 * restricted.
 *
 * The hook subscribes only when a uid is provided. Sign-out flips
 * the consumer's uid to undefined; the listener tears down.
 *
 * Future S4d-full will populate strikes + restrictionEndsAt on
 * auto-restrict. S4e-MVP writes both as null on manual restriction.
 * The hook surfaces only the boolean for now — fields are present
 * on the cached doc shape for forward-compat. */

export interface RestrictedStatus {
  /** True iff the user has an active restriction doc. */
  isRestricted: boolean;
  /** True while the snapshot is loading. False after first delivery
   *  (regardless of whether a doc was found). Consumers that want to
   *  avoid flashing the gate during initial load should gate on
   *  !loading. */
  loading: boolean;
}

interface CachedDoc {
  exists: boolean;
  restrictedAt: Timestamp | null;
  restrictionEndsAt: Timestamp | null;
  lastActionedReport: string | null;
  strikes: number | null;
}

/* Module-level cache + listener registry — same shape as
   useBlockedUsers. Single onSnapshot subscription per uid; consumer
   hooks register force-render callbacks. */
const cache = new Map<string, CachedDoc | null>(); // null = loading
const listeners = new Map<string, Set<() => void>>();
const subscriptions = new Map<string, () => void>(); // unsubscribers

function notify(uid: string) {
  listeners.get(uid)?.forEach((fn) => fn());
}

function ensureSubscribed(uid: string) {
  if (subscriptions.has(uid)) return;
  const unsub = onSnapshot(
    doc(db, "globalRestrictedUids", uid),
    (snap) => {
      const data = snap.data();
      cache.set(uid, {
        exists: snap.exists(),
        restrictedAt: (data?.restrictedAt as Timestamp | undefined) ?? null,
        restrictionEndsAt:
          (data?.restrictionEndsAt as Timestamp | undefined) ?? null,
        lastActionedReport:
          (data?.lastActionedReport as string | undefined) ?? null,
        strikes: (data?.strikes as number | undefined) ?? null,
      });
      notify(uid);
    },
    (err) => {
      /* Read errors are usually rules-deny when the consumer's auth
         uid doesn't match the doc path uid — i.e. trying to peek at
         another user's restriction. Treat as not-restricted (which
         is what the hook's gate behaviour requires for non-self
         queries anyway) and report. */
      captureError(
        err instanceof Error ? err : new Error(String(err)),
        "network",
        {
          hook: "useRestrictedStatus",
          uid,
        }
      );
      cache.set(uid, {
        exists: false,
        restrictedAt: null,
        restrictionEndsAt: null,
        lastActionedReport: null,
        strikes: null,
      });
      notify(uid);
    }
  );
  subscriptions.set(uid, unsub);
}

export function useRestrictedStatus(uid: string | undefined): RestrictedStatus {
  /* Force-render counter pattern (same as useBlockedUsers) — listeners
     bump this when the cache mutates; the actual status is derived
     from cache during render. */
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

    ensureSubscribed(uid);

    return () => {
      bucket?.delete(force);
      /* When the last consumer for a uid unsubscribes, tear down the
         onSnapshot listener too. Cache survives — next subscription
         re-uses the cached doc on first render before the listener
         re-resolves. */
      if (bucket?.size === 0) {
        const unsub = subscriptions.get(uid);
        if (unsub) {
          unsub();
          subscriptions.delete(uid);
        }
      }
    };
  }, [uid]);

  if (!uid) return { isRestricted: false, loading: false };
  const cached = cache.get(uid);
  if (cached === undefined) return { isRestricted: false, loading: true };
  return { isRestricted: cached?.exists ?? false, loading: false };
}

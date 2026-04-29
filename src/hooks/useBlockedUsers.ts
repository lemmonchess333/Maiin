import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { getBlockedUsers } from '../lib/socialApi';
import { captureError } from '../lib/errorReporting';

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
/* Listeners are no-arg force-render bumps. The blocked Set itself
 * lives only in `cache`; consumers read from cache during render and
 * use these listeners to know when to re-render after a mutation. */
const listeners = new Map<string, Set<() => void>>();

function notify(uid: string) {
  listeners.get(uid)?.forEach((fn) => fn());
}

export interface UseBlockedUsersReturn {
  blocked: Set<string>;
  addBlocked: (uid: string) => void;
  removeBlocked: (uid: string) => void;
}

export function useBlockedUsers(): UseBlockedUsersReturn {
  const { user } = useAuth();
  const uid = user?.uid;
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

    /* Initial fetch on first call for this uid. Cache hit case
       requires no work — the next render reads from cache directly. */
    if (!cache.has(uid)) {
      getBlockedUsers(uid)
        .then((ids) => {
          const set = new Set(ids);
          cache.set(uid, set);
          notify(uid);
        })
        .catch((e) => {
          captureError(e instanceof Error ? e : new Error(String(e)), 'network', { hook: 'useBlockedUsers' });
        });
    }

    return () => {
      bucket?.delete(force);
    };
  }, [uid]);

  // Derived during render. Pure; uid change → empty set automatically.
  const blocked: Set<string> = uid ? cache.get(uid) ?? new Set() : new Set();

  const addBlocked = useCallback((uid: string) => {
    if (!user) return;
    const next = new Set(cache.get(user.uid) ?? new Set());
    next.add(uid);
    cache.set(user.uid, next);
    notify(user.uid);
  }, [user]);

  const removeBlocked = useCallback((uid: string) => {
    if (!user) return;
    const next = new Set(cache.get(user.uid) ?? new Set());
    next.delete(uid);
    cache.set(user.uid, next);
    notify(user.uid);
  }, [user]);

  return { blocked, addBlocked, removeBlocked };
}

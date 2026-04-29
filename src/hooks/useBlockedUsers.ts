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
const listeners = new Map<string, Set<(s: Set<string>) => void>>();

function notify(uid: string, set: Set<string>) {
  listeners.get(uid)?.forEach((fn) => fn(set));
}

export interface UseBlockedUsersReturn {
  blocked: Set<string>;
  addBlocked: (uid: string) => void;
  removeBlocked: (uid: string) => void;
}

export function useBlockedUsers(): UseBlockedUsersReturn {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(() => {
    return user ? cache.get(user.uid) ?? new Set() : new Set();
  });

  useEffect(() => {
    if (!user) {
      setBlocked(new Set());
      return;
    }
    // Subscribe this component to future updates for this uid.
    let bucket = listeners.get(user.uid);
    if (!bucket) {
      bucket = new Set();
      listeners.set(user.uid, bucket);
    }
    bucket.add(setBlocked);

    // Seed from cache or fetch on first call for this uid.
    const cached = cache.get(user.uid);
    if (cached) {
      setBlocked(cached);
    } else {
      getBlockedUsers(user.uid)
        .then((ids) => {
          const set = new Set(ids);
          cache.set(user.uid, set);
          notify(user.uid, set);
        })
        .catch((e) => {
          captureError(e instanceof Error ? e : new Error(String(e)), 'network', { hook: 'useBlockedUsers' });
        });
    }

    return () => {
      bucket?.delete(setBlocked);
    };
  }, [user]);

  const addBlocked = useCallback((uid: string) => {
    if (!user) return;
    const next = new Set(cache.get(user.uid) ?? new Set());
    next.add(uid);
    cache.set(user.uid, next);
    notify(user.uid, next);
  }, [user]);

  const removeBlocked = useCallback((uid: string) => {
    if (!user) return;
    const next = new Set(cache.get(user.uid) ?? new Set());
    next.delete(uid);
    cache.set(user.uid, next);
    notify(user.uid, next);
  }, [user]);

  return { blocked, addBlocked, removeBlocked };
}

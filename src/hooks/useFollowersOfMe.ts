import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { getFollowerIds } from '../lib/socialApi';
import { captureError } from '../lib/errorReporting';

/* Module-level cache + listener registry mirroring useBlockedUsers.
 *
 * Multiple consumers (suggested-people row, search-result row, future
 * "Follows you" surfaces) share one Set so a follow-back from another
 * surface immediately updates every visible badge. Without the shared
 * cache, each component would issue its own getFollowerIds query and
 * potentially render stale "Follows you" / "Follow back" copy.
 *
 * The Set lives in `cache`; consumers read from it during render and
 * use `listeners` to know when to re-render after a fetch resolves
 * or a follow-back changes.
 */
const cache = new Map<string, Set<string>>();
const listeners = new Map<string, Set<() => void>>();

function notify(uid: string) {
  listeners.get(uid)?.forEach((fn) => fn());
}

export interface UseFollowersOfMeReturn {
  /** Set of UIDs that follow the current user. Empty until the
   *  initial fetch resolves (and stays empty if the fetch fails). */
  followers: Set<string>;
  /** Imperatively add a UID — used by the inverse-follow flow when a
   *  user follows me back from another device, or as an optimistic
   *  update from a UI surface that knows the change happened. */
  addFollower: (uid: string) => void;
  removeFollower: (uid: string) => void;
}

export function useFollowersOfMe(): UseFollowersOfMeReturn {
  const { user } = useAuth();
  const uid = user?.uid;
  /* Force-render counter — same pattern as useBlockedUsers; avoids
     react-hooks/set-state-in-effect by deriving the value during
     render and only bumping a tick when the cache mutates. */
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

    if (!cache.has(uid)) {
      getFollowerIds(uid)
        .then((ids) => {
          cache.set(uid, ids);
          notify(uid);
        })
        .catch((e) => {
          captureError(e instanceof Error ? e : new Error(String(e)), 'network', {
            hook: 'useFollowersOfMe',
          });
        });
    }

    return () => {
      bucket?.delete(force);
    };
  }, [uid]);

  const followers: Set<string> = uid ? cache.get(uid) ?? new Set() : new Set();

  const addFollower = (id: string) => {
    if (!uid) return;
    const next = new Set<string>(cache.get(uid) ?? []);
    next.add(id);
    cache.set(uid, next);
    notify(uid);
  };

  const removeFollower = (id: string) => {
    if (!uid) return;
    const next = new Set<string>(cache.get(uid) ?? []);
    next.delete(id);
    cache.set(uid, next);
    notify(uid);
  };

  return { followers, addFollower, removeFollower };
}

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { getSuggestedPeople, type SuggestedPerson } from '@/lib/socialApi';
import { logger } from '@/lib/logger';

/**
 * Fetch a list of people to suggest the user follow. Runs lazily —
 * only when `active` is true (typically gated on the Find tab being
 * open) so users browsing the Feed don't pay for reads they won't see.
 *
 * v1 strategy lives in `getSuggestedPeople`:
 *   - crew members first (if user is in a crew)
 *   - then recent public posters
 *   - filters out self, already-followed, blocked
 *
 * Re-fetches when the user identity or crew changes. Consumers that
 * need fresh data (e.g. after following someone and wanting them gone
 * from the list) can call the returned `refresh()`.
 */
export function useSuggestedPeople(active: boolean, blockedUsers?: Set<string>) {
  const { user, profile } = useAuth();
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await getSuggestedPeople(user.uid, {
        crewId: profile?.crewId ?? undefined,
        limitCount: 10,
        blockedUsers,
      });
      setPeople(list);
    } catch (err) {
      logger.error('[useSuggestedPeople] fetch failed', err);
      setPeople([]);
    } finally {
      setLoading(false);
    }
    // `blockedUsers` is a Set — reference-identity stable across renders
    // when coming from `useBlockedUsers`, safe to depend on directly.
  }, [user, profile?.crewId, blockedUsers]);

  useEffect(() => {
    // When the hook goes inactive, drop the cached list so the UI
    // doesn't flash stale suggestions if the user reopens the tab
    // later with a different crew / follow state.
    if (!active) {
      return () => setPeople([]);
    }
    let cancelled = false;
    load().catch(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [active, load, refreshKey]);

  return {
    people,
    loading,
    refresh: () => setRefreshKey((k) => k + 1),
    /**
     * Optimistically remove a suggestion from the list. Call this
     * from the FollowButton's onFollowChange so users get immediate
     * visual feedback that the person they just followed has
     * moved from "Suggested" to their Following feed, instead of
     * sitting in the suggestion list stale until the next refresh.
     */
    remove: (uid: string) => setPeople((prev) => prev.filter((p) => p.uid !== uid)),
  };
}

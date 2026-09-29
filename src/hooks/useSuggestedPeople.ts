import { useState, useEffect } from "react";
import { useUid } from "@/lib/auth";
import { getSuggestedPeople, type SuggestedPerson } from "@/lib/socialApi";
import { logger } from "@/lib/logger";

/**
 * Fetch a list of people to suggest the user follow. Runs lazily —
 * only when `active` is true (typically gated on the Find tab being
 * open) so users browsing the Feed don't pay for reads they won't see.
 *
 * v1 strategy lives in `getSuggestedPeople`:
 *   - recent public posters
 *   - filters out self, already-followed, blocked
 *
 * Re-fetches when the user identity changes. Consumers that
 * need fresh data (e.g. after following someone and wanting them gone
 * from the list) can call the returned `refresh()`.
 *
 * Each list is stored with the request it answered (account, block list,
 * joined spaces, refresh count). `loading` is true while the current
 * request has no answer, and a list is only returned to the account it
 * was fetched for — after a switch the tab shows nothing until the new
 * account's list lands. A same-account refetch keeps the current list
 * visible while it loads, and an answer to a superseded request is
 * dropped.
 */
interface Suggestions {
  uid: string | null;
  blockedUsers: Set<string> | undefined;
  joinedSpaceIds: string[] | undefined;
  refreshKey: number;
  people: SuggestedPerson[];
}

const NO_PEOPLE: SuggestedPerson[] = [];
const NO_SUGGESTIONS: Suggestions = {
  uid: null,
  blockedUsers: undefined,
  joinedSpaceIds: undefined,
  refreshKey: -1,
  people: NO_PEOPLE,
};

export function useSuggestedPeople(
  active: boolean,
  blockedUsers?: Set<string>,
  /** SOC-P2e — joined space ids; shared-space members become the
   *  highest-priority, context-labelled candidates. */
  joinedSpaceIds?: string[]
) {
  const uid = useUid();
  const [suggestions, setSuggestions] = useState<Suggestions>(NO_SUGGESTIONS);
  const [refreshKey, setRefreshKey] = useState(0);

  const ownList = uid !== null && suggestions.uid === uid;
  const answered =
    ownList &&
    suggestions.blockedUsers === blockedUsers &&
    suggestions.joinedSpaceIds === joinedSpaceIds &&
    suggestions.refreshKey === refreshKey;
  const people = ownList ? suggestions.people : NO_PEOPLE;
  const loading = active && uid !== null && !answered;

  useEffect(() => {
    // When the hook goes inactive, drop the cached list so the UI
    // doesn't flash stale suggestions if the user reopens the tab
    // later with a different follow state.
    if (!active) {
      return () => setSuggestions(NO_SUGGESTIONS);
    }
    if (!uid) return;
    let cancelled = false;
    // `blockedUsers` is a Set — reference-identity stable across renders
    // when coming from `useBlockedUsers`, safe to depend on directly.
    // joinedSpaceIds arrives as a memoised array from the caller.
    getSuggestedPeople(uid, {
      limitCount: 10,
      blockedUsers,
      joinedSpaceIds,
    }).then(
      (list) => {
        if (cancelled) return;
        setSuggestions({
          uid,
          blockedUsers,
          joinedSpaceIds,
          refreshKey,
          people: list,
        });
      },
      (err) => {
        logger.error("[useSuggestedPeople] fetch failed", err);
        if (cancelled) return;
        setSuggestions({
          uid,
          blockedUsers,
          joinedSpaceIds,
          refreshKey,
          people: NO_PEOPLE,
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [active, uid, blockedUsers, joinedSpaceIds, refreshKey]);

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
    remove: (uid: string) =>
      setSuggestions((prev) => ({
        ...prev,
        people: prev.people.filter((p) => p.uid !== uid),
      })),
  };
}

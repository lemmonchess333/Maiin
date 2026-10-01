import { useState, useEffect } from "react";
import { useUid } from "@/lib/auth";
import { getSuggestedPeople, type SuggestedPerson } from "@/lib/socialApi";
import { logger } from "@/lib/logger";
import { noteFollowState } from "@/hooks/useFollowState";

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
  /** The joined space ids the list was fetched for, joined into one
   *  string: callers rebuild the array, so it is compared by value. */
  joinedKey: string | null;
  refreshKey: number;
  people: SuggestedPerson[];
}

const NO_PEOPLE: SuggestedPerson[] = [];
const NO_SUGGESTIONS: Suggestions = {
  uid: null,
  blockedUsers: undefined,
  joinedKey: null,
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
  // Compared by value. Callers derive this array from other state, and
  // when one rebuilt it every render the list was never "answered": each
  // answer re-rendered, the new array started another fetch, and People
  // re-read the database in a loop for as long as it was open.
  const joinedKey = (joinedSpaceIds ?? []).join(",");

  const ownList = uid !== null && suggestions.uid === uid;
  const answered =
    ownList &&
    suggestions.blockedUsers === blockedUsers &&
    suggestions.joinedKey === joinedKey &&
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
    getSuggestedPeople(uid, {
      limitCount: 10,
      blockedUsers,
      joinedSpaceIds: joinedKey ? joinedKey.split(",") : [],
    }).then(
      (list) => {
        if (cancelled) return;
        // Everyone suggested is someone not followed yet, so their
        // Follow buttons needn't each ask.
        for (const p of list) noteFollowState(uid, p.uid, false);
        setSuggestions({
          uid,
          blockedUsers,
          joinedKey,
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
          joinedKey,
          refreshKey,
          people: NO_PEOPLE,
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [active, uid, blockedUsers, joinedKey, refreshKey]);

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

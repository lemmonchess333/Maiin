import { useEffect, useState } from "react";
import {
  socialPreferenceKey,
  purgeLegacySocialKey,
} from "@/lib/socialPreferenceKeys";
import { readString, writeString } from "@/lib/localStore";

/**
 * Soc5b pin (3) — Feed sub-tab new-content dot.
 *
 * Tracks the newest item timestamp the user has seen on each Feed
 * sub-tab (Following / Explore) so a subtle dot can render on the
 * INACTIVE sub-tab when newer content arrives there. Active sub-tab
 * never renders the dot — the user is looking at the items directly.
 *
 * Lock spec (Soc5b pin 3): "Subtle dot indicator on sub-tab when
 * new content since last view; cleared on tab view per Tropos's
 * calm positioning — no aggressive count badges."
 *
 * Persistence: localStorage per-tab key, survives session restart.
 * Reset semantics: each render where a sub-tab is active syncs its
 * "seen" timestamp to the newest currently-visible item, so a user
 * who stays on Following while new items stream in won't see a stale
 * dot when they later switch to Explore and back.
 *
 * SOCIAL-ATTENTION-01: the seen pointers are uid-scoped (via
 * `socialPreferenceKey`), so on a shared browser account B doesn't
 * inherit account A's "seen" instants and mistakenly hide the dot.
 * The pre-scoping global keys are purged on mount, never migrated.
 */

function readSeen(key: string): string {
  return readString(key) ?? "0";
}

function writeSeen(key: string, value: string) {
  /* Storage write failures (Safari private mode, quota) are non-fatal —
     the dot will reappear next session, which is a graceful degradation. */
  writeString(key, value);
}

/**
 * Coerce a Firestore Timestamp-like value or ISO string to a
 * sortable ISO string. Returns "0" when the value is missing /
 * malformed so comparisons fall back to "no new content".
 */
function toIso(value: unknown): string {
  if (!value) return "0";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as { toDate?: () => Date };
    if (typeof v.toDate === "function") {
      try {
        return v.toDate().toISOString();
      } catch {
        return "0";
      }
    }
  }
  return "0";
}

interface FreshnessInput {
  /** SOC-P3a: "communities" is a valid active sub-tab; the two dots it
   *  tracks stay following/explore (the communities source has no
   *  freshness pointer in v1). */
  activeSubTab: "following" | "explore" | "communities";
  followingNewestCreatedAt: unknown;
  exploreNewestCreatedAt: unknown;
  /** The signed-in user's uid — scopes the seen pointers so account B
   *  can't inherit account A's dots on a shared browser. */
  uid: string | null | undefined;
}

/** Purge the pre-uid-scoping global keys once (they're never migrated). */
function purgeLegacyFreshnessKeys() {
  purgeLegacySocialKey("feed-following-last-viewed");
  purgeLegacySocialKey("feed-explore-last-viewed");
}

export function useFeedSubTabFreshness({
  activeSubTab,
  followingNewestCreatedAt,
  exploreNewestCreatedAt,
  uid,
}: FreshnessInput): {
  followingHasNew: boolean;
  exploreHasNew: boolean;
} {
  const followingKey = uid
    ? socialPreferenceKey(uid, "feed-following-last-viewed")
    : null;
  const exploreKey = uid
    ? socialPreferenceKey(uid, "feed-explore-last-viewed")
    : null;

  /* Lazy initialisers — only touch localStorage once per mount.
     State (not refs) so the boolean comparisons below can read them
     during render without violating react-hooks/refs. The seen
     pointers update rarely (only when active sub-tab sees a newer
     item), so the extra render is cheap. */
  const [followingSeen, setFollowingSeen] = useState<string>(() => {
    purgeLegacyFreshnessKeys();
    return followingKey ? readSeen(followingKey) : "0";
  });
  const [exploreSeen, setExploreSeen] = useState<string>(() =>
    exploreKey ? readSeen(exploreKey) : "0"
  );

  /* Account-switch reset (React "adjust state during render" idiom):
     when the uid changes, re-read the new account's seen pointers so
     the previous account's dots don't leak. Runs during render, before
     the comparisons below — no effect, no set-state-in-effect. */
  const [ownerUid, setOwnerUid] = useState<string | null | undefined>(uid);
  if (ownerUid !== uid) {
    setOwnerUid(uid);
    setFollowingSeen(followingKey ? readSeen(followingKey) : "0");
    setExploreSeen(exploreKey ? readSeen(exploreKey) : "0");
  }

  const followingNewest = toIso(followingNewestCreatedAt);
  const exploreNewest = toIso(exploreNewestCreatedAt);

  /* Sync the active sub-tab's "seen" pointer to its newest visible
     item — guarantees that switching away from Following after watching
     new items arrive doesn't strand the dot. The guard `newest > seen`
     keeps the state update + localStorage write minimal. */
  /* Syncing localStorage-backed external state into the hook when the
     active sub-tab observes a newer item than the user had previously
     seen across sessions. The `newest > seen` guard terminates the
     update — once the seen pointer matches the latest item, no further
     state writes fire, so there's no render loop. The lint rule warns
     about cascading renders generally; this case is the intentional
     external-state-sync pattern flagged in React's "you might not need
     an effect" docs as the legitimate exception. */
  useEffect(() => {
    if (
      activeSubTab === "following" &&
      followingKey &&
      followingNewest > followingSeen
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external-state sync, guard terminates loop
      setFollowingSeen(followingNewest);
      writeSeen(followingKey, followingNewest);
    }
    if (
      activeSubTab === "explore" &&
      exploreKey &&
      exploreNewest > exploreSeen
    ) {
      setExploreSeen(exploreNewest);
      writeSeen(exploreKey, exploreNewest);
    }
  }, [
    activeSubTab,
    followingNewest,
    exploreNewest,
    followingSeen,
    exploreSeen,
    followingKey,
    exploreKey,
  ]);

  /* Inactive sub-tab gets a dot iff its newest item is newer than
     its stored seen pointer. Active sub-tab never shows a dot. */
  const followingHasNew =
    activeSubTab !== "following" && followingNewest > followingSeen;
  const exploreHasNew =
    activeSubTab !== "explore" && exploreNewest > exploreSeen;

  return { followingHasNew, exploreHasNew };
}

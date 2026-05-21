import { useEffect, useState } from "react";

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
 */
const STORAGE_KEY_FOLLOWING = "tropos-social-feed-following-last-viewed";
const STORAGE_KEY_EXPLORE = "tropos-social-feed-explore-last-viewed";

function readSeen(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "0";
  } catch {
    return "0";
  }
}

function writeSeen(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* localStorage write failures (Safari private mode, quota) are
       non-fatal — the dot will reappear next session, which is a
       graceful degradation. */
  }
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
  activeSubTab: "following" | "explore";
  followingNewestCreatedAt: unknown;
  exploreNewestCreatedAt: unknown;
}

export function useFeedSubTabFreshness({
  activeSubTab,
  followingNewestCreatedAt,
  exploreNewestCreatedAt,
}: FreshnessInput): {
  followingHasNew: boolean;
  exploreHasNew: boolean;
} {
  /* Lazy initialisers — only touch localStorage once per mount.
     State (not refs) so the boolean comparisons below can read them
     during render without violating react-hooks/refs. The seen
     pointers update rarely (only when active sub-tab sees a newer
     item), so the extra render is cheap. */
  const [followingSeen, setFollowingSeen] = useState<string>(() =>
    readSeen(STORAGE_KEY_FOLLOWING),
  );
  const [exploreSeen, setExploreSeen] = useState<string>(() =>
    readSeen(STORAGE_KEY_EXPLORE),
  );

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
    if (activeSubTab === "following" && followingNewest > followingSeen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external-state sync, guard terminates loop
      setFollowingSeen(followingNewest);
      writeSeen(STORAGE_KEY_FOLLOWING, followingNewest);
    }
    if (activeSubTab === "explore" && exploreNewest > exploreSeen) {
      setExploreSeen(exploreNewest);
      writeSeen(STORAGE_KEY_EXPLORE, exploreNewest);
    }
  }, [activeSubTab, followingNewest, exploreNewest, followingSeen, exploreSeen]);

  /* Inactive sub-tab gets a dot iff its newest item is newer than
     its stored seen pointer. Active sub-tab never shows a dot. */
  const followingHasNew =
    activeSubTab !== "following" && followingNewest > followingSeen;
  const exploreHasNew =
    activeSubTab !== "explore" && exploreNewest > exploreSeen;

  return { followingHasNew, exploreHasNew };
}

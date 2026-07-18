import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth";
import { getFollowingIds } from "@/lib/socialApi";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import {
  socialPreferenceKey,
  purgeLegacySocialKey,
} from "@/lib/socialPreferenceKeys";
import type { Crew } from "./useCrews";

/** Soc5d Phase 2: localStorage array of dismissed crew suggestion IDs.
 *  Mirrors S2b's "exclude rejected suggestions" pattern. Per-device by
 *  design — cross-device sync deferred until demand emerges.
 *  SOCIAL-ATTENTION-01: uid-scoped so account B on a shared browser
 *  doesn't inherit account A's dismissals; the pre-scoping global key
 *  is purged, never migrated. */

/** Soc5d locked rule: friend-of-friend inference requires ≥2 connections
 *  before a crew shows as suggested. Single-overlap suggestions are too
 *  noisy at small scale and create awkward false-positives ("we suggested
 *  this crew because one person you follow is in it"). */
const MIN_FOLLOW_MATCHES = 2;

function readDismissed(uid: string | undefined): Set<string> {
  if (typeof window === "undefined" || !uid) return new Set();
  try {
    purgeLegacySocialKey("dismissed-crews");
    const raw = window.localStorage.getItem(
      socialPreferenceKey(uid, "dismissed-crews")
    );
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(arr)
        ? arr.filter((x): x is string => typeof x === "string")
        : []
    );
  } catch {
    return new Set();
  }
}

function writeDismissed(uid: string | undefined, ids: Set<string>) {
  if (!uid) return;
  try {
    window.localStorage.setItem(
      socialPreferenceKey(uid, "dismissed-crews"),
      JSON.stringify([...ids])
    );
  } catch {
    // private mode / quota exceeded — state still updates in memory
  }
}

export interface SuggestedCrew extends Crew {
  /** Count of the current user's follows who are members of this crew.
   *  Drives the "X of your follows are here" subtitle on the card. */
  matchedFollows: number;
}

/**
 * Soc5d Phase 2 — Suggested Crews hook.
 *
 * Computes "crews where ≥2 of the user's follows are members" via the
 * S2b friend-of-friend pattern. Reads follows once + each follow's
 * profile (`crewId` is a single field on user docs today; multi-crew
 * membership is a future schema change). Buckets by crewId, filters to
 * crews meeting the MIN_FOLLOW_MATCHES threshold, excludes the user's
 * own crew and any locally-dismissed suggestions.
 *
 * Runs lazily — only when `active` is true (gated on the Crews tab
 * being visible) so users browsing the Feed don't pay for reads they
 * won't see. Returns `dismiss(crewId)` for the per-card X button +
 * `refresh()` for pull-to-refresh integration.
 */
export function useSuggestedCrews(active: boolean, allCrews: Crew[]) {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const [crews, setCrews] = useState<SuggestedCrew[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    readDismissed(uid)
  );
  // Bumped on every load() so a late resolve from account A can't
  // setCrews after a switch to account B.
  const genRef = useRef(0);

  // Account-switch reset (adjust-state-during-render idiom): re-read
  // the new account's dismissals and drop the previous list.
  const [ownerUid, setOwnerUid] = useState<string | undefined>(uid);
  if (ownerUid !== uid) {
    setOwnerUid(uid);
    setDismissed(readDismissed(uid));
    setCrews([]);
  }

  const ownCrewId = profile?.crewId;

  const load = useCallback(async () => {
    if (!user) {
      setCrews([]);
      return;
    }
    const myGen = ++genRef.current;
    const isCurrent = () => genRef.current === myGen;
    setLoading(true);
    try {
      const followIds = await getFollowingIds(user.uid);
      // Fast exit: can't meet MIN_FOLLOW_MATCHES if the user follows
      // fewer than that many people. Saves N profile reads in the
      // common new-user case.
      if (followIds.size < MIN_FOLLOW_MATCHES) {
        if (isCurrent()) setCrews([]);
        return;
      }
      const profileSnaps = await Promise.all(
        [...followIds].map((followUid) =>
          getDoc(doc(db, "users", followUid)).catch(() => null)
        )
      );
      const buckets = new Map<string, number>();
      for (const snap of profileSnaps) {
        if (!snap || !snap.exists()) continue;
        const data = snap.data() as { crewId?: string };
        if (!data.crewId) continue;
        buckets.set(data.crewId, (buckets.get(data.crewId) ?? 0) + 1);
      }
      const result: SuggestedCrew[] = [];
      for (const crew of allCrews) {
        if (crew.id === ownCrewId) continue;
        if (dismissed.has(crew.id)) continue;
        const count = buckets.get(crew.id) ?? 0;
        if (count >= MIN_FOLLOW_MATCHES) {
          result.push({ ...crew, matchedFollows: count });
        }
      }
      // Sort: most-matched first; tie-break by crew popularity.
      result.sort(
        (a, b) =>
          b.matchedFollows - a.matchedFollows || b.memberCount - a.memberCount
      );
      if (isCurrent()) setCrews(result);
    } catch (err) {
      logger.error("[useSuggestedCrews] fetch failed", err);
      if (isCurrent()) setCrews([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [user, ownCrewId, allCrews, dismissed]);

  useEffect(() => {
    // When the hook goes inactive, drop the cached list so the UI
    // doesn't flash stale suggestions if the user reopens the tab
    // later with different follows / crew state.
    if (!active) {
      return () => setCrews([]);
    }
    let cancelled = false;
    load().catch(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [active, load, refreshKey]);

  const dismiss = useCallback(
    (crewId: string) => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(crewId);
        writeDismissed(uid, next);
        return next;
      });
      setCrews((prev) => prev.filter((c) => c.id !== crewId));
    },
    [uid]
  );

  return {
    crews,
    loading,
    refresh: useCallback(() => setRefreshKey((k) => k + 1), []),
    dismiss,
  };
}

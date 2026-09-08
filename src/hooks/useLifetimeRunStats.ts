import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { sumLifetimeRunTotals } from "@/lib/runStatsEligibility";
import {
  recordedRaceMilestones,
  type MilestoneRace,
} from "@/lib/recordedRaceMilestones";

export interface LifetimeRunStats {
  runCount: number;
  totalDistanceM: number;
  /** Earliest eligible run, or null. See LifetimeRunTotals for why it is
   *  derived from this whole-collection read rather than at the surface. */
  firstRun: { id: string; date: string; distanceMetres: number } | null;
  /** Explicitly recorded races from the same read, with no second scan. */
  races: MilestoneRace[];
}

/**
 * Single-shot Firestore read of every run doc, summed for the
 * "Lifetime totals" footer on the History page. Separate from
 * useRunningStats because that hook applies a `where('completedAt', '>=')`
 * filter — fine for analytics windows, but it would silently exclude
 * pre-window runs from a "lifetime" total.
 *
 * `enabled` (default true) gates the read: callers that only need the count
 * inside a narrow condition (e.g. the Home cold-start activation window)
 * pass `enabled: false` once that condition lapses, so an established user
 * with hundreds of runs never pays for a full-collection read on a surface
 * that no longer consumes it.
 */
export function useLifetimeRunStats(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const uid = useUid();
  const [stats, setStats] = useState<LifetimeRunStats>({
    runCount: 0,
    totalDistanceM: 0,
    firstRun: null,
    races: [],
  });
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [statsUid, setStatsUid] = useState<string | null>(null);
  /**
   * A read that FAILED is not a user with no runs, and until this existed
   * the two were the same observable state: the catch below logged and
   * left `runCount` at 0, which is the exact value that makes History's
   * Tier-1 auto-hide drop the whole Running section. The user saw their
   * running analytics silently disappear, with the only evidence in a
   * console the app doesn't show them.
   */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid || !enabled) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", uid, "runs"));
        if (cancelled) return;
        setFailed(false);
        // `id` is carried through so the chronology's first-run entry has a
        // stable key; the doc data does not contain it.
        const runs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        setStats({
          ...sumLifetimeRunTotals(runs),
          races: recordedRaceMilestones(runs),
        });
        setStatsUid(uid);
        setLoadedUid(uid);
      } catch (err) {
        logger.error("useLifetimeRunStats error:", err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoadedUid(uid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, enabled]);

  // Account changes must hide the old account's race/session identifiers
  // synchronously, before the next effect or read can run.
  const visible =
    uid && enabled && statsUid === uid
      ? stats
      : { runCount: 0, totalDistanceM: 0, firstRun: null, races: [] };
  return {
    ...visible,
    loading: Boolean(uid && enabled && loadedUid !== uid),
    failed: Boolean(uid && enabled && loadedUid === uid && failed),
  };
}

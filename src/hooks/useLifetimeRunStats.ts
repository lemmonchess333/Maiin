import { useEffect, useState } from "react";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  isVolumeEligible,
  sumLifetimeRunTotals,
} from "@/lib/runStatsEligibility";
import { fetchSavedRuns, type SavedRun } from "@/lib/savedRuns";
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
  /**
   * Every run the totals count, as a finish time and a distance, from the
   * same read. Analytics compares its window with the one before it, and
   * `useRunningStats` only reads the window itself.
   */
  dated: DatedRun[];
  /**
   * Every run, parsed, whatever its eligibility: the pool ALL-TIME records
   * are drawn from. The PRs tab built "All-time" from the Analytics
   * window's runs (`useRunningStats(rangeDays)`), so at the default range
   * its all-time records were the last 30 days', and a runner whose best
   * runs predated the range saw "--". Each record applies its own
   * eligibility to this pool.
   */
  runs: SavedRun[];
}

export interface DatedRun {
  completedAtMs: number;
  /** The local day the run belongs to (Lift3: the day it started). */
  day: string;
  distanceM: number;
}

const EMPTY: LifetimeRunStats = {
  runCount: 0,
  totalDistanceM: 0,
  firstRun: null,
  races: [],
  dated: [],
  runs: [],
};

/** The runs the totals count, as a finish time, a day and a distance. */
function datedRuns(runs: readonly SavedRun[]): DatedRun[] {
  return runs.filter(isVolumeEligible).map((run) => ({
    completedAtMs: run.completedAt.getTime(),
    day: run.day,
    distanceM: run.distance,
  }));
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
  const [stats, setStats] = useState<LifetimeRunStats>(EMPTY);
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
        // Every saved run, through the saved-run reader, oldest first. Each
        // is placed in the chronology on its Lift3 day, so a run saved
        // before `date` existed is placed by its finish rather than dropped.
        const runs = (await fetchSavedRuns(uid, { all: true })).reverse();
        if (cancelled) return;
        setFailed(false);
        const records = runs.map((run) => ({ ...run, date: run.day }));
        setStats({
          ...sumLifetimeRunTotals(records),
          races: recordedRaceMilestones(records),
          dated: datedRuns(runs),
          runs,
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
  const visible = uid && enabled && statsUid === uid ? stats : EMPTY;
  return {
    ...visible,
    loading: Boolean(uid && enabled && loadedUid !== uid),
    failed: Boolean(uid && enabled && loadedUid === uid && failed),
  };
}

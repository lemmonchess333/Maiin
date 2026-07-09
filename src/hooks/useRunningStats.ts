import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { isVolumeEligible } from "../lib/runStatsEligibility";
import { localWeekKey } from "../lib/dateHelpers";

export interface RunningWeekData {
  week: string;
  totalDistance: number;
  runCount: number;
  avgPace: number;
}

export interface RunSummaryItem {
  id: string;
  distance: number; // metres
  duration: number; // seconds
  avgPace: number; // sec/km
  elevationGain: number;
  calories: number;
  activityType: string;
  completedAt: Date;
  routePreview?: { lat: number; lon: number }[];
  /* Validity metadata persisted by PR #480. Carried on the item so
     downstream UI (Recent Runs badges) can render transparency
     labels without re-querying. Stat aggregations consult these
     via the eligibility helpers. Optional because legacy docs
     (pre-#480) don't have the fields. */
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

/**
 * Bucket a flat run list into Sunday-anchored weeks. Pure function —
 * extracted so the bug it carries is unit-testable without mocking
 * Firestore + auth + the hook lifecycle.
 *
 * Volume eligibility is applied internally so the hook can return
 * the unfiltered `runs` array for transparency UI (Recent Runs
 * showing invalid/saved-anyway records with badges) while keeping
 * the weekly tile aggregations honest. A run that fails
 * `isVolumeEligible` contributes nothing to count, distance, or
 * pace this week.
 */
export function aggregateWeeklyData(runs: RunSummaryItem[]): RunningWeekData[] {
  const weeks: Record<
    string,
    { distance: number; count: number; paceSum: number; paceCount: number }
  > = {};
  for (const run of runs) {
    if (!isVolumeEligible(run)) continue;
    // Sunday-start week key in pure LOCAL date math. Previously this mixed
    // local getDay()/setDate() with a UTC toISOString() key, so runs logged
    // near midnight in non-UTC zones bucketed into the wrong week.
    const key = localWeekKey(new Date(run.completedAt));
    if (!weeks[key])
      weeks[key] = { distance: 0, count: 0, paceSum: 0, paceCount: 0 };
    weeks[key].distance += run.distance / 1000;
    weeks[key].count += 1;
    if (run.distance > 0 && run.avgPace > 0) {
      weeks[key].paceSum += run.avgPace;
      weeks[key].paceCount += 1;
    }
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      totalDistance: Math.round(d.distance * 10) / 10,
      runCount: d.count,
      avgPace: d.paceCount > 0 ? Math.round(d.paceSum / d.paceCount) : 0,
    }));
}

export function useRunningStats(days: number = 30) {
  const { user } = useAuth();
  const [weeklyData, setWeeklyData] = useState<RunningWeekData[]>([]);
  const [runs, setRuns] = useState<RunSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Hist4: refresh trigger for pull-to-refresh. Incrementing the
  // tick forces the load effect below to re-run via the dep array.
  // Public surface is the `refresh()` callback below.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!user) {
      // Clear the previous account's data on sign-out — not just `loading`.
      // If the component stays mounted across an account switch (shared-device
      // sign-out → sign-in, or a transient null-user window), leaving `runs` /
      // `weeklyData` populated leaks account A's runs into account B's view
      // until B's load completes (the uid-scoping class hardened in PR #820).
      setRuns([]);
      setWeeklyData([]);
      setLoading(false);
      return;
    }

    const loadStats = async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const runsRef = collection(db, "users", user.uid, "runs");
      const q = query(
        runsRef,
        where("completedAt", ">=", Timestamp.fromDate(since)),
        orderBy("completedAt", "desc")
      );
      const snap = await getDocs(q);

      const runList: RunSummaryItem[] = [];

      snap.docs.forEach((d) => {
        const data = d.data();
        /* No source filter. `runs` is the transparent record-of-truth
           list — Recent Runs renders all of them with Invalid /
           Saved-anyway badges so the user can see entries they
           saved exist on their account. Stat aggregations apply
           `isVolumeEligible` (weekly tile, lifetime totals,
           leaderboards, streaks) or `isPaceEligible` (Best Pace,
           Fastest 1K/5K, Longest Run) downstream from this list. */
        let date: Date | undefined;
        if (data.completedAt instanceof Timestamp) {
          date = data.completedAt.toDate();
        } else if (data.completedAt instanceof Date) {
          date = data.completedAt;
        } else if (typeof data.completedAt === "number") {
          date = new Date(data.completedAt);
        } else if (data.completedAt?.toDate) {
          date = data.completedAt.toDate();
        }
        if (!date) return;

        runList.push({
          id: d.id,
          distance: data.distance || 0,
          duration: data.duration || 0,
          avgPace: data.avgPace || 0,
          elevationGain: data.elevationGain || 0,
          calories: data.calories || 0,
          activityType: data.activityType || "freerun",
          completedAt: date,
          isInvalid: data.isInvalid === true,
          savedAnyway: data.savedAnyway === true,
          routePreview:
            data.points?.length > 1
              ? data.points
                  .filter(
                    (_: { lat: number; lon: number }, i: number) =>
                      i % Math.ceil(data.points.length / 20) === 0
                  )
                  .map((p: { lat: number; lon: number }) => ({
                    lat: p.lat,
                    lon: p.lon,
                  }))
              : undefined,
        });
      });

      setWeeklyData(aggregateWeeklyData(runList));
      setRuns(runList);
      setLoading(false);
    };

    loadStats();
  }, [user, days, refreshTick]);

  return {
    weeklyData,
    runs,
    loading,
    /** Hist4: re-runs the underlying getDocs query. Used by the
     *  History page's pull-to-refresh gesture; the other History
     *  data sources (useWorkouts, useMeals) are onSnapshot listeners
     *  so they're already live. Returns a promise that resolves
     *  when the next render with fresh data settles — but the
     *  loading flag is also exposed if callers want to gate UI on
     *  the refresh completing. */
    refresh: () => setRefreshTick((n) => n + 1),
  };
}

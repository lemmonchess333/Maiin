import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { isCountableRun } from '../lib/runGuards';

export interface RunningWeekData {
  week: string;
  totalDistance: number;
  runCount: number;
  avgPace: number;
}

export interface RunSummaryItem {
  id: string;
  distance: number;       // metres
  duration: number;       // seconds
  avgPace: number;        // sec/km
  elevationGain: number;
  calories: number;
  activityType: string;
  completedAt: Date;
  routePreview?: { lat: number; lon: number }[];
}

/**
 * Bucket a flat run list into Sunday-anchored weeks. Pure function —
 * extracted so the bug it carries is unit-testable without mocking
 * Firestore + auth + the hook lifecycle.
 *
 * `count` reflects every run regardless of distance — keeps History's
 * "total runs" tile honest. `avgPace` is averaged ONLY across runs
 * that actually moved (positive distance + positive pace), so
 * "Save anyway" 0km zombies don't drag the weekly pace toward zero
 * (the bug that produced "AVG PACE 0:40/km" on History after a few
 * sub-threshold saves).
 */
export function aggregateWeeklyData(runs: RunSummaryItem[]): RunningWeekData[] {
  const weeks: Record<string, { distance: number; count: number; paceSum: number; paceCount: number }> = {};
  for (const run of runs) {
    const weekStart = new Date(run.completedAt);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split('T')[0];
    if (!weeks[key]) weeks[key] = { distance: 0, count: 0, paceSum: 0, paceCount: 0 };
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

  useEffect(() => {
    if (!user) { const reset = () => { setLoading(false); }; reset(); return; }

    const loadStats = async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const runsRef = collection(db, 'users', user.uid, 'runs');
      const q = query(
        runsRef,
        where('completedAt', '>=', Timestamp.fromDate(since)),
        orderBy('completedAt', 'desc')
      );
      const snap = await getDocs(q);

      const runList: RunSummaryItem[] = [];

      snap.docs.forEach(d => {
        const data = d.data();
        /* Drop invalid + zero-distance records before they reach
           aggregation. The downstream `aggregateWeeklyData` already
           had a `distance > 0 && avgPace > 0` guard for pace; pulling
           the filter up here keeps the semantics consistent across
           runCount, totalDistance, and avgPace and matches the
           predicate used by every other stat surface (Lifetime,
           leaderboard, trajectory, crew totals). */
        if (!isCountableRun(data)) return;
        let date: Date | undefined;
        if (data.completedAt instanceof Timestamp) {
          date = data.completedAt.toDate();
        } else if (data.completedAt instanceof Date) {
          date = data.completedAt;
        } else if (typeof data.completedAt === 'number') {
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
          activityType: data.activityType || 'freerun',
          completedAt: date,
          routePreview: data.points?.length > 1
            ? data.points
                .filter((_: { lat: number; lon: number }, i: number) => i % Math.ceil(data.points.length / 20) === 0)
                .map((p: { lat: number; lon: number }) => ({ lat: p.lat, lon: p.lon }))
            : undefined,
        });
      });

      setWeeklyData(aggregateWeeklyData(runList));
      setRuns(runList);
      setLoading(false);
    };

    loadStats();
  }, [user, days]);

  return { weeklyData, runs, loading };
}
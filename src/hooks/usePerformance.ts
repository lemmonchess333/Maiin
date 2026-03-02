/* ─────────────────────────────────────────────
usePerformance — Phase 2
Primary: reads server-computed docs from
users/{uid}/performance (last 12 weeks).
Fallback: computes client-side if no server
docs exist (graceful migration).
───────────────────────────────────────────── */

import { useEffect, useState, useMemo } from ‘react’;
import {
collection,
query,
orderBy,
limit,
onSnapshot,
} from ‘firebase/firestore’;
import { db } from ‘@/lib/firebase’;
import { useAuth } from ‘@/lib/auth’;
import { useWorkouts } from ‘./useWorkouts’;
import { useRunningStats } from ‘./useRunningStats’;
import { useMeals } from ‘./useMeals’;
import { useBodyweightTrend } from ‘./useBodyweightTrend’;
import type { WeeklyAggregates, PerformanceDoc } from ‘@/lib/performanceTypes’;
import {
getWeekKey,
weekKeyMinusN,
computePerformanceIndex,
} from ‘@/lib/performanceEngine’;

const WEEKS_TO_SHOW = 12;
const BASELINE_WEEKS = 4;

export function usePerformance() {
const { user, profile } = useAuth();

// ── Server-side docs (primary source) ──
const [serverDocs, setServerDocs] = useState<PerformanceDoc[]>([]);
const [serverLoading, setServerLoading] = useState(true);

useEffect(() => {
if (!user) {
setServerDocs([]);
setServerLoading(false);
return;
}

```
const perfRef = collection(db, 'users', user.uid, 'performance');
const q = query(perfRef, orderBy('weekKey', 'desc'), limit(WEEKS_TO_SHOW));

const unsubscribe = onSnapshot(
  q,
  (snapshot) => {
    const docs = snapshot.docs.map((d) => d.data() as PerformanceDoc);
    setServerDocs(docs);
    setServerLoading(false);
  },
  (err) => {
    console.warn('usePerformance: Firestore listener error, falling back to client', err);
    setServerDocs([]);
    setServerLoading(false);
  },
);

return unsubscribe;
```

}, [user]);

// ── Client-side fallback data (only used if no server docs) ──
const { workouts, loading: workoutsLoading } = useWorkouts();
const { weeklyData: runWeeklyData, loading: runsLoading } = useRunningStats(WEEKS_TO_SHOW * 7 + 30);
const { meals, loading: mealsLoading } = useMeals();
const { weekly: bwWeekly } = useBodyweightTrend();
const clientDataLoading = workoutsLoading || runsLoading || mealsLoading;

const clientDocs = useMemo(() => {
// Only compute client-side if server has no docs and client data is loaded
if (serverDocs.length > 0 || clientDataLoading) return [];

```
const now = new Date();
const currentWeekKey = getWeekKey(now);
const totalWeeksNeeded = WEEKS_TO_SHOW + BASELINE_WEEKS;
const allWeekKeys: string[] = [];
for (let i = 0; i < totalWeeksNeeded; i++) {
  allWeekKeys.push(weekKeyMinusN(currentWeekKey, i));
}

// Aggregate workouts by week
const liftByWeek: Record<string, { tonnage: number; hardSets: number; sessions: number }> = {};
workouts.forEach((w) => {
  const wk = getWeekKey(new Date(w.date));
  if (!liftByWeek[wk]) liftByWeek[wk] = { tonnage: 0, hardSets: 0, sessions: 0 };
  liftByWeek[wk].sessions++;
  w.exercises?.forEach((ex) => {
    const isCardio = ex.category?.toLowerCase() === 'cardio';
    ex.sets?.forEach((set, idx) => {
      liftByWeek[wk].tonnage += (set.weightKg || 0) * (set.reps || 0);
      if (!isCardio && idx === (ex.sets.length - 1)) {
        liftByWeek[wk].hardSets++;
      }
    });
  });
});

// Running
const runByWeek: Record<string, { km: number; longKm: number; qualityCount: number; sessions: number }> = {};
runWeeklyData.forEach((rd) => {
  runByWeek[rd.week] = {
    km: rd.totalDistance,
    longKm: rd.totalDistance,
    qualityCount: 0,
    sessions: rd.runCount,
  };
});

// Meals
const mealsByWeek: Record<string, { days: Set<string>; totalCal: number; totalProt: number; mealCount: number }> = {};
meals.forEach((m) => {
  const wk = getWeekKey(new Date(m.date + 'T00:00:00'));
  if (!mealsByWeek[wk]) mealsByWeek[wk] = { days: new Set(), totalCal: 0, totalProt: 0, mealCount: 0 };
  mealsByWeek[wk].days.add(m.date);
  mealsByWeek[wk].totalCal += m.totalCalories || 0;
  mealsByWeek[wk].totalProt += m.totalProtein || 0;
  mealsByWeek[wk].mealCount++;
});

// Build aggregates
const aggregatesMap: Record<string, WeeklyAggregates> = {};
allWeekKeys.forEach((wk) => {
  const lift = liftByWeek[wk];
  const run = runByWeek[wk];
  const ml = mealsByWeek[wk];
  const daysLogged = ml?.days.size || 0;

  aggregatesMap[wk] = {
    weekKey: wk,
    liftTonnage: lift?.tonnage || 0,
    liftHardSets: lift?.hardSets || 0,
    liftSessions: lift?.sessions || 0,
    runKm: run?.km || 0,
    runLongKm: run?.longKm || 0,
    runQualityCount: run?.qualityCount || 0,
    runSessions: run?.sessions || 0,
    mealDaysLogged: daysLogged,
    avgDailyCalories: daysLogged > 0 ? (ml!.totalCal / daysLogged) : 0,
    avgDailyProtein: daysLogged > 0 ? (ml!.totalProt / daysLogged) : 0,
    bwCurrent7dAvg: null,
    bwPrevious7dAvg: null,
  };
});

// Compute PI for display weeks
const docs: PerformanceDoc[] = [];
const displayWeeks = allWeekKeys.slice(0, WEEKS_TO_SHOW).reverse();

displayWeeks.forEach((wk, idx) => {
  const current = aggregatesMap[wk];
  if (!current) return;

  const baselineKeys: string[] = [];
  for (let b = 1; b <= BASELINE_WEEKS; b++) {
    baselineKeys.push(weekKeyMinusN(wk, b));
  }
  const priorWeeks = baselineKeys
    .map((k) => aggregatesMap[k])
    .filter(Boolean);

  const previousDoc = idx > 0 ? docs[idx - 1] : undefined;

  const doc = computePerformanceIndex(
    current,
    priorWeeks,
    {
      weeklyWorkoutsTarget: profile?.weeklyWorkoutsTarget,
      targetCalories: profile?.targetCalories,
      targetProtein: profile?.targetProtein,
    },
    previousDoc?.performanceIndex,
  );
  docs.push(doc);
});

return docs.reverse();
```

}, [serverDocs.length, workouts, runWeeklyData, meals, bwWeekly, clientDataLoading, profile]);

// ── Merge: prefer server, fall back to client ──
const performanceDocs = serverDocs.length > 0 ? serverDocs : clientDocs;
const loading = serverLoading || (serverDocs.length === 0 && clientDataLoading);
const current = performanceDocs[0] ?? null;
const source: ‘server’ | ‘client’ = serverDocs.length > 0 ? ‘server’ : ‘client’;

return {
performanceDocs,
current,
loading,
source,
};
}
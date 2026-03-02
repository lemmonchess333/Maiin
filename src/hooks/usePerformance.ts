/* ─────────────────────────────────────────────
   usePerformance — Client-side Performance Engine
   Reads from existing hooks (workouts, runs, meals,
   bodyweight) and computes weekly Performance Index.
   Returns last 12 weeks of PerformanceDoc.
   ───────────────────────────────────────────── */

import { useMemo } from 'react';
import { useWorkouts } from './useWorkouts';
import { useRunningStats } from './useRunningStats';
import { useMeals } from './useMeals';
import { useBodyweightTrend } from './useBodyweightTrend';
import { useAuth } from '@/lib/auth';
import type { WeeklyAggregates, PerformanceDoc } from '@/lib/performanceTypes';
import {
  getWeekKey,
  weekKeyMinusN,
  computePerformanceIndex,
} from '@/lib/performanceEngine';

const WEEKS_TO_SHOW = 12;
const BASELINE_WEEKS = 4;

export function usePerformance() {
  const { profile } = useAuth();
  const { workouts, loading: workoutsLoading } = useWorkouts();
  const { weeklyData: runWeeklyData, loading: runsLoading } = useRunningStats(WEEKS_TO_SHOW * 7 + 30);
  const { meals, loading: mealsLoading } = useMeals();
  const { weekly: bwWeekly } = useBodyweightTrend();

  const loading = workoutsLoading || runsLoading || mealsLoading;

  const performanceDocs = useMemo(() => {
    if (loading) return [];

    const now = new Date();
    const currentWeekKey = getWeekKey(now);

    // Build week keys for the window we need (current + 12 display + 4 baseline buffer)
    const totalWeeksNeeded = WEEKS_TO_SHOW + BASELINE_WEEKS;
    const allWeekKeys: string[] = [];
    for (let i = 0; i < totalWeeksNeeded; i++) {
      allWeekKeys.push(weekKeyMinusN(currentWeekKey, i));
    }

    // ── Aggregate workouts by week ──
    const liftByWeek: Record<string, { tonnage: number; hardSets: number; sessions: number }> = {};
    workouts.forEach((w) => {
      const wk = getWeekKey(new Date(w.date));
      if (!liftByWeek[wk]) liftByWeek[wk] = { tonnage: 0, hardSets: 0, sessions: 0 };
      liftByWeek[wk].sessions++;
      w.exercises?.forEach((ex) => {
        const isCardio = ex.category?.toLowerCase() === 'cardio';
        ex.sets?.forEach((set, idx) => {
          liftByWeek[wk].tonnage += (set.weightKg || 0) * (set.reps || 0);
          // Last set of each non-cardio exercise = hard set proxy
          if (!isCardio && idx === (ex.sets.length - 1)) {
            liftByWeek[wk].hardSets++;
          }
        });
      });
    });

    // ── Running data is already weekly from useRunningStats ──
    const runByWeek: Record<string, { km: number; longKm: number; qualityCount: number; sessions: number }> = {};
    runWeeklyData.forEach((rd) => {
      runByWeek[rd.week] = {
        km: rd.totalDistance,
        longKm: rd.totalDistance, // useRunningStats gives weekly total; we approximate
        qualityCount: 0, // can't distinguish from aggregated data — fine for now
        sessions: rd.runCount,
      };
    });

    // ── Meals by week ──
    const mealsByWeek: Record<string, { days: Set<string>; totalCal: number; totalProt: number; mealCount: number }> = {};
    meals.forEach((m) => {
      const wk = getWeekKey(new Date(m.date + 'T00:00:00'));
      if (!mealsByWeek[wk]) mealsByWeek[wk] = { days: new Set(), totalCal: 0, totalProt: 0, mealCount: 0 };
      mealsByWeek[wk].days.add(m.date);
      mealsByWeek[wk].totalCal += m.totalCalories || 0;
      mealsByWeek[wk].totalProt += m.totalProtein || 0;
      mealsByWeek[wk].mealCount++;
    });

    // ── Build WeeklyAggregates for each week ──
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
        bwCurrent7dAvg: bwWeekly.length > 0 ? null : null, // TODO: wire up properly when bw data is per-day
        bwPrevious7dAvg: null,
      };
    });

    // ── Compute PI for each of the display weeks ──
    const docs: PerformanceDoc[] = [];

    // Process oldest first so we can pass previousWeekPI
    const displayWeeks = allWeekKeys.slice(0, WEEKS_TO_SHOW).reverse();

    displayWeeks.forEach((wk, idx) => {
      const current = aggregatesMap[wk];
      if (!current) return;

      // Baseline = 4 weeks before this week
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

    // Return newest first
    return docs.reverse();
  }, [workouts, runWeeklyData, meals, bwWeekly, loading, profile]);

  // Current week = first doc (newest)
  const current = performanceDocs[0] ?? null;

  return {
    performanceDocs,
    current,
    loading,
  };
}
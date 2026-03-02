// src/hooks/usePerformance.ts

import { useMemo } from "react";
import { useWorkouts } from "./useWorkouts";
import { useRunningStats } from "./useRunningStats";
import { useMeals } from "./useMeals";
import { useBodyweightTrend } from "./useBodyweightTrend";
import { useAuth } from "@/lib/auth";

import type { WeeklyAggregates, PerformanceDoc } from "@/lib/performanceTypes";
import { getWeekKey, weekKeyMinusN, computePerformanceIndex } from "@/lib/performanceEngine";

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

    // We need display weeks plus some buffer for baseline calculation
    const totalWeeksNeeded = WEEKS_TO_SHOW + BASELINE_WEEKS;
    const allWeekKeys: string[] = [];
    for (let i = 0; i < totalWeeksNeeded; i++) {
      allWeekKeys.push(weekKeyMinusN(currentWeekKey, i));
    }

    // Aggregate lifting
    const liftByWeek: Record<
      string,
      { tonnage: number; hardSets: number; sessions: number }
    > = {};

    workouts.forEach((w: any) => {
      const wk = getWeekKey(new Date(w.date));
      if (!liftByWeek[wk]) liftByWeek[wk] = { tonnage: 0, hardSets: 0, sessions: 0 };

      liftByWeek[wk].sessions += 1;

      (w.exercises || []).forEach((ex: any) => {
        const isCardio = String(ex.category || "").toLowerCase() === "cardio";
        const sets = ex.sets || [];

        sets.forEach((set: any, idx: number) => {
          const weightKg = Number(set.weightKg || 0);
          const reps = Number(set.reps || 0);
          liftByWeek[wk].tonnage += weightKg * reps;

          // Proxy for "hard set": last set of each non-cardio exercise
          if (!isCardio && idx === sets.length - 1) {
            liftByWeek[wk].hardSets += 1;
          }
        });
      });
    });

    // Running (already weekly)
    const runByWeek: Record<
      string,
      { km: number; longKm: number; qualityCount: number; sessions: number }
    > = {};

    (runWeeklyData || []).forEach((rd: any) => {
      runByWeek[rd.week] = {
        km: Number(rd.totalDistance || 0),
        // useRunningStats returns weekly totals; treat as approx long run for now
        longKm: Number(rd.totalDistance || 0),
        qualityCount: 0,
        sessions: Number(rd.runCount || 0),
      };
    });

    // Meals by week
    const mealsByWeek: Record<
      string,
      { days: Set<string>; totalCal: number; totalProt: number }
    > = {};

    (meals || []).forEach((m: any) => {
      const wk = getWeekKey(new Date(String(m.date) + "T00:00:00"));
      if (!mealsByWeek[wk]) {
        mealsByWeek[wk] = { days: new Set<string>(), totalCal: 0, totalProt: 0 };
      }
      mealsByWeek[wk].days.add(String(m.date));
      mealsByWeek[wk].totalCal += Number(m.totalCalories || 0);
      mealsByWeek[wk].totalProt += Number(m.totalProtein || 0);
    });

    // Bodyweight weekly (placeholder wiring)
    // If your useBodyweightTrend already returns weekKey -> avg, wire it here later.
    void bwWeekly;

    // Build WeeklyAggregates for each week
    const aggregatesMap: Record<string, WeeklyAggregates> = {};

    allWeekKeys.forEach((wk) => {
      const lift = liftByWeek[wk];
      const run = runByWeek[wk];
      const ml = mealsByWeek[wk];

      const daysLogged = ml ? ml.days.size : 0;
      const avgDailyCalories = daysLogged > 0 ? ml!.totalCal / daysLogged : 0;
      const avgDailyProtein = daysLogged > 0 ? ml!.totalProt / daysLogged : 0;

      aggregatesMap[wk] = {
        weekKey: wk,

        liftTonnage: lift ? lift.tonnage : 0,
        liftHardSets: lift ? lift.hardSets : 0,
        liftSessions: lift ? lift.sessions : 0,

        runKm: run ? run.km : 0,
        runLongKm: run ? run.longKm : 0,
        runQualityCount: run ? run.qualityCount : 0,
        runSessions: run ? run.sessions : 0,

        mealDaysLogged: daysLogged,
        avgDailyCalories,
        avgDailyProtein,

        // TODO: wire from bodyweight trend
        bwCurrent7dAvg: null,
        bwPrevious7dAvg: null,
      };
    });

    // Compute PI for each display week (oldest -> newest to provide previousWeekPI)
    const docsOldestFirst: PerformanceDoc[] = [];
    const displayWeeksOldestFirst = allWeekKeys.slice(0, WEEKS_TO_SHOW).reverse();

    displayWeeksOldestFirst.forEach((wk, idx) => {
      const current = aggregatesMap[wk];
      if (!current) return;

      // Baseline is the weeks before the current week
      const baselineKeys: string[] = [];
      for (let b = 1; b <= BASELINE_WEEKS; b++) {
        baselineKeys.push(weekKeyMinusN(wk, b));
      }

      const priorWeeks = baselineKeys
        .map((k) => aggregatesMap[k])
        .filter(Boolean);

      const prev = idx > 0 ? docsOldestFirst[idx - 1] : undefined;

      const doc = computePerformanceIndex(
        current,
        priorWeeks,
        {
          weeklyWorkoutsTarget: profile?.weeklyWorkoutsTarget,
          targetCalories: profile?.targetCalories ?? null,
          targetProtein: profile?.targetProtein ?? null,
        },
        prev?.performanceIndex
      );

      docsOldestFirst.push(doc);
    });

    // Return newest first
    return docsOldestFirst.reverse();
  }, [workouts, runWeeklyData, meals, bwWeekly, loading, profile]);

  const current = performanceDocs[0] ?? null;

  return {
    performanceDocs,
    current,
    loading,
  };
}
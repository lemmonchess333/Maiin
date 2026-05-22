import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, Timestamp, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import type { Workout } from "@/hooks/useWorkouts";
import type { UserProfile } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isWorkoutOnDate } from "@/lib/workoutDate";
import { sumMealTotals, type MealTotalsInput } from "@/lib/mealTotals";
import { isVolumeEligible } from "@/lib/runStatsEligibility";

interface WeightInfo {
  weight: string;
  date: string;
  rawDate: string | null;
}

interface PostWorkoutNudge {
  type: "lift" | "run" | "both";
  proteinRemaining: number;
}

interface HomeDataState {
  dailyCal: number;
  dailyProt: number;
  // Carbs + fat carried through so the Home TodayEnergy card can render the
  // *actual* logged macros from meal docs. Previously TodayEnergy estimated
  // them from leftover calories after protein (62/38 split), which drifted
  // from the real numbers surfaced on the Food page and caused a visible
  // mismatch (e.g. Home showing 200g carbs, Food showing 400g).
  dailyCarbs: number;
  dailyFat: number;
  todayRunCals: number;
  lastWeightInfo: WeightInfo | null;
  loading: boolean;
  error: string | null;
}

export function useHomeData(
  user: { uid: string } | null,
  profile: UserProfile | null,
  workouts: Workout[],
  weightUnit: "kg" | "lbs"
) {
  const [state, setState] = useState<HomeDataState>({
    dailyCal: 0,
    dailyProt: 0,
    dailyCarbs: 0,
    dailyFat: 0,
    todayRunCals: 0,
    lastWeightInfo: null,
    loading: true,
    error: null,
  });

  // Batch Firestore queries with Promise.allSettled
  useEffect(function () {
    if (!user?.uid) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state before async fetch
    setState(function (prev) { return { ...prev, loading: true, error: null }; });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayTs = Timestamp.fromDate(startOfToday);
    const todayKey = format(new Date(), "yyyy-MM-dd");

    // Filter on the client-set `date` string — same field Food's useMeals
    // uses when it calls `getDailyTotals(date)`. Previously this query
    // filtered on `createdAt >= todayTs` (server timestamp), which diverged
    // from Food whenever a meal's local `date` didn't line up with its
    // server `createdAt` (midnight edge, backdated entry, timezone). That
    // was the remaining source of the Home/Food macro mismatch even after
    // both paths started using sumMealTotals.
    const fetchMeals = getDocs(
      query(collection(db, "users", user.uid, "meals"), where("date", "==", todayKey))
    );

    const fetchRuns = getDocs(
      query(collection(db, "users", user.uid, "runs"), where("completedAt", ">=", todayTs))
    );

    const fetchWeight = getDocs(
      query(collection(db, "users", user.uid, "bodyweightLogs"), orderBy("date", "desc"), limit(30))
    );

    Promise.allSettled([fetchMeals, fetchRuns, fetchWeight]).then(function (results) {
      if (cancelled) return;

      const errors: string[] = [];
      let cal = 0;
      let prot = 0;
      let carb = 0;
      let fat = 0;
      let rCals = 0;
      let weightInfo: WeightInfo | null = null;

      // Meals — routed through the shared sumMealTotals util so this
      // path can't drift from useMeals.getDailyTotals on Food. Both call
      // sites read the same bare/prefixed-field fallbacks and coerce
      // non-finite values identically.
      if (results[0].status === "fulfilled") {
        const rawMeals: MealTotalsInput[] = results[0].value.docs.map(
          (d) => d.data() as MealTotalsInput,
        );
        const totals = sumMealTotals(rawMeals);
        cal = totals.calories;
        prot = totals.protein;
        carb = totals.carbs;
        fat = totals.fat;
      } else {
        logger.error("[useHomeData] meals fetch failed:", results[0].reason);
        errors.push("Failed to load meals");
      }

      // Runs — today's run-calorie aggregate feeds the Home energy
      // tile and the HybridBalanceCard. P0.5: skip non-countable
      // runs so a saved-anyway "too-fast" 20km / 0:08 misclick
      // doesn't credit the user ~1500kcal of phantom burn and
      // distort the daily energy picture.
      if (results[1].status === "fulfilled") {
        const weightKg = profile?.weightKg || 70;
        results[1].value.docs.forEach(function (d) {
          const data = d.data();
          if (!isVolumeEligible(data)) return;
          const distKm = (data.distance || 0) / 1000;
          rCals += Math.round(weightKg * distKm * 1.036);
        });
      } else {
        logger.error("[useHomeData] runs fetch failed:", results[1].reason);
        errors.push("Failed to load runs");
      }

      // Weight
      if (results[2].status === "fulfilled") {
        const snap = results[2].value;
        if (snap.empty) {
          if (profile?.weightKg) {
            const w = weightUnit === "lbs" ? (profile.weightKg * 2.20462).toFixed(1) : profile.weightKg.toFixed(1);
            weightInfo = { weight: w, date: "From profile", rawDate: null };
          }
        } else {
          const entries = snap.docs
            .map(function (doc) { const d = doc.data(); return { date: d.date as string, weight: d.weight as number }; })
            .filter(function (e) { return typeof e.weight === "number"; });
          if (entries.length > 0) {
            const sorted = [...entries].sort(function (a, b) { return a.date.localeCompare(b.date); });
            const latest = sorted[sorted.length - 1];
            const w = weightUnit === "lbs" ? (latest.weight * 2.20462).toFixed(1) : latest.weight.toFixed(1);
            weightInfo = { weight: w, date: format(new Date(latest.date + "T12:00:00"), "MMM d"), rawDate: latest.date };
          }
        }
      } else {
        logger.error("[useHomeData] weight fetch failed:", results[2].reason);
        errors.push("Failed to load weight");
        // Fallback to profile weight
        if (profile?.weightKg) {
          const w = weightUnit === "lbs" ? (profile.weightKg * 2.20462).toFixed(1) : profile.weightKg.toFixed(1);
          weightInfo = { weight: w, date: "From profile", rawDate: null };
        }
      }

      setState({
        dailyCal: cal,
        dailyProt: prot,
        dailyCarbs: carb,
        dailyFat: fat,
        todayRunCals: rCals,
        lastWeightInfo: weightInfo,
        loading: false,
        error: errors.length > 0 ? errors.join("; ") : null,
      });
    });

    return function () { cancelled = true; };
  }, [user?.uid, weightUnit, profile?.weightKg]);

  // Workout calories — read the canonical stored totalCalories via the shared
  // isWorkoutOnDate helper so Home matches Food's useEffectiveTargets.
  // Null-safe fallback to 0 when a legacy workout doc is missing the field.
  const todayWorkoutCals = useMemo(function () {
    const now = new Date();
    return workouts
      .filter(function (w) { return isWorkoutOnDate(w, now); })
      .reduce(function (sum, w) { return sum + (w.totalCalories ?? 0); }, 0);
  }, [workouts]);

  // Post-workout nudge — uses Date.now() so must be in useEffect, not useMemo
  const [postWorkoutNudge, setPostWorkoutNudge] = useState<PostWorkoutNudge | null>(null);
  useEffect(function () {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayWorkouts = workouts.filter(function (w) { return w.date === todayStr; });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing nudge when no workouts today
    if (todayWorkouts.length === 0) { setPostWorkoutNudge(null); return; }

    const latest = todayWorkouts.reduce(function (a, b) {
      return (b.createdAt?.toMillis?.() || 0) > (a.createdAt?.toMillis?.() || 0) ? b : a;
    });

    const createdMs = latest.createdAt?.toMillis?.() || Date.now();
    const minutesSince = Math.round((Date.now() - createdMs) / 60000);
    if (minutesSince > 120) { setPostWorkoutNudge(null); return; }

    const hasLift = latest.exercises.some(function (e) { return e.category !== "cardio"; });
    const hasRun = latest.exercises.some(function (e) { return e.category === "cardio"; });
    const type: PostWorkoutNudge["type"] = hasLift && hasRun ? "both" : hasRun ? "run" : "lift";

    const targetProtein = profile?.targetProtein || 160;
    const proteinRemaining = Math.max(0, targetProtein - state.dailyProt);

    setPostWorkoutNudge({ type, proteinRemaining });
  }, [workouts, profile?.targetProtein, state.dailyProt]);

  const setLastWeightInfo = function (info: WeightInfo | null) {
    setState(function (prev) { return { ...prev, lastWeightInfo: info }; });
  };

  return {
    dailyCal: state.dailyCal,
    dailyProt: state.dailyProt,
    dailyCarbs: state.dailyCarbs,
    dailyFat: state.dailyFat,
    todayWorkoutCals,
    todayRunCals: state.todayRunCals,
    lastWeightInfo: state.lastWeightInfo,
    setLastWeightInfo,
    postWorkoutNudge,
    loading: state.loading,
    error: state.error,
  };
}

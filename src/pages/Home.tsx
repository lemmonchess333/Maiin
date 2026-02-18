import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats } from "@/hooks/useFirestore";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";
import BodyweightLogger from "@/components/BodyweightLogger";

import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type DailyTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MealDoc = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  createdAt?: Timestamp;
};

export default function Home() {
  const { profile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const bodyweightTrend = useBodyweightTrend();

  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");

  // ✅ Daily Macro Totals State
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  // ✅ Fetch Today's Meals
  useEffect(() => {
    if (!profile?.uid) return;

    async function fetchTodayMeals() {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const mealsRef = collection(
          db,
          "users",
          profile.uid,
          "meals"
        );

        const q = query(
          mealsRef,
          where("createdAt", ">=", Timestamp.fromDate(todayStart))
        );

        const snapshot = await getDocs(q);

        const totals: DailyTotals = {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        };

        snapshot.forEach((doc) => {
          const data = doc.data() as MealDoc;

          totals.calories += data.calories ?? 0;
          totals.protein += data.protein ?? 0;
          totals.carbs += data.carbs ?? 0;
          totals.fat += data.fat ?? 0;
        });

        setDailyTotals(totals);
      } catch (error) {
        console.error("Error fetching daily meals:", error);
      }
    }

    fetchTodayMeals();
  }, [profile?.uid]);

  if (!profile) return null;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Hey, {profile.displayName || "Athlete"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's your {mode} summary
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(["weekly", "monthly"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* ✅ Daily Intake Card */}
      <div className="p-4 rounded-xl bg-card border border-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Today's Intake
        </h2>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Calories</p>
            <p className="font-semibold">{dailyTotals.calories}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Protein</p>
            <p className="font-semibold">{dailyTotals.protein}g</p>
          </div>
          <div>
            <p className="text-muted-foreground">Carbs</p>
            <p className="font-semibold">{dailyTotals.carbs}g</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fat</p>
            <p className="font-semibold">{dailyTotals.fat}g</p>
          </div>
        </div>
      </div>

      {/* Adaptive Summary */}
      <AdaptiveSummary
        athleteType={profile.athleteType}
        mode={mode}
        weightKg={profile.weightKg}
        heightCm={profile.heightCm}
        weeklyWorkoutsDone={weeklyStats.workoutsDone}
        weeklyWorkoutsTarget={weeklyStats.workoutsTarget}
        weeklyMealsDone={weeklyStats.mealsDone}
        weeklyMealsTarget={weeklyStats.mealsTarget}
        weeklyPR={weeklyStats.hasPR}
        weeklyBodyweightTrend={bodyweightTrend.weekly}
        monthlyWorkoutsDone={monthlyStats.workoutsDone}
        monthlyWorkoutsTarget={monthlyStats.workoutsTarget}
        monthlyMealsDone={monthlyStats.mealsDone}
        monthlyMealsTarget={monthlyStats.mealsTarget}
        monthlyPR={monthlyStats.hasPR}
        monthlyBodyweightTrend={bodyweightTrend.monthly}
      />

      {/* Bodyweight Logger */}
      <BodyweightLogger />

      {/* Quick Tip */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-sm text-foreground font-medium">
          Quick Tip
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Log workouts, bodyweight, and meals daily to maximise adaptive performance feedback.
        </p>
      </div>

    </div>
  );
}
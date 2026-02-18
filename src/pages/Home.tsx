import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats } from "@/hooks/useFirestore";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";
import BodyweightLogger from "@/components/BodyweightLogger";

import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type DailyTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export default function Home() {
  const { user, profile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const bodyweightTrend = useBodyweightTrend();

  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");

  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  useEffect(() => {
    if (!user) return;

    async function fetchTodayMeals() {
      if (!user) return;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const mealsRef = collection(db, "users", user.uid, "meals");
      const q = query(
        mealsRef,
        where("createdAt", ">=", Timestamp.fromDate(todayStart))
      );

      const snapshot = await getDocs(q);

      const totals: DailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        totals.calories += data.totalCalories || data.calories || 0;
        totals.protein += data.totalProtein || data.protein || 0;
        totals.carbs += data.totalCarbs || data.carbs || 0;
        totals.fat += data.totalFat || data.fat || 0;
      });

      setDailyTotals(totals);
    }

    fetchTodayMeals();
  }, [user]);

  if (!profile) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading your profile...
      </div>
    );
  }

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

      {/* Today's Intake */}
      <div className="bg-card rounded-xl border border-border/50 p-4">
        <p className="text-sm font-medium text-foreground mb-3">Today's Intake</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-lg font-bold text-orange-600">{dailyTotals.calories}</p>
            <p className="text-xs text-orange-500">cal</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-lg font-bold text-blue-600">{dailyTotals.protein}g</p>
            <p className="text-xs text-blue-500">protein</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-2">
            <p className="text-lg font-bold text-amber-600">{dailyTotals.carbs}g</p>
            <p className="text-xs text-amber-500">carbs</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-2">
            <p className="text-lg font-bold text-purple-600">{dailyTotals.fat}g</p>
            <p className="text-xs text-purple-500">fat</p>
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
        <p className="text-sm text-foreground font-medium">Quick Tip</p>
        <p className="text-xs text-muted-foreground mt-1">
          Log your workouts, bodyweight and meals daily to maximise performance adaptation.
        </p>
      </div>
    </div>
  );
}
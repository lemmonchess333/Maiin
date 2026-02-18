import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats } from "@/hooks/useFirestore";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { AdaptiveSummary, AdaptiveSummaryProps } from "@/components/AdaptiveSummary";
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
  const { profile } = useAuth();
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

  // Fetch today's meals safely
  useEffect(() => {
    const uid = profile?.id ?? profile?.userId ?? ""; // adjust if your auth returns a different id field
    if (!uid) return;

    async function fetchTodayMeals() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const mealsRef = collection(db, "users", uid, "meals");
      const q = query(
        mealsRef,
        where("createdAt", ">=", Timestamp.fromDate(todayStart))
      );

      const snapshot = await getDocs(q);

      const totals: DailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      snapshot.forEach((doc) => {
        const data = doc.data();
        totals.calories += data.calories || 0;
        totals.protein += data.protein || 0;
        totals.carbs += data.carbs || 0;
        totals.fat += data.fat || 0;
      });

      setDailyTotals(totals);
    }

    fetchTodayMeals();
  }, [profile]);

  if (!profile) {
    return <div className="p-8 text-center text-muted-foreground">Loading your profile...</div>;
  }

  // Prepare props for AdaptiveSummary safely
  const adaptiveProps: AdaptiveSummaryProps = {
    athleteType: profile.athleteType ?? "unknown",
    mode,
    weightKg: profile.weightKg ?? 0,
    heightCm: profile.heightCm ?? 0,
    weeklyWorkoutsDone: weeklyStats?.workoutsDone ?? 0,
    weeklyWorkoutsTarget: weeklyStats?.workoutsTarget ?? 0,
    weeklyMealsDone: weeklyStats?.mealsDone ?? 0,
    weeklyMealsTarget: weeklyStats?.mealsTarget ?? 0,
    weeklyPR: weeklyStats?.hasPR ?? false,
    weeklyBodyweightTrend: bodyweightTrend?.weekly ?? [],
    monthlyWorkoutsDone: monthlyStats?.workoutsDone ?? 0,
    monthlyWorkoutsTarget: monthlyStats?.workoutsTarget ?? 0,
    monthlyMealsDone: monthlyStats?.mealsDone ?? 0,
    monthlyMealsTarget: monthlyStats?.mealsTarget ?? 0,
    monthlyPR: monthlyStats?.hasPR ?? false,
    monthlyBodyweightTrend: bodyweightTrend?.monthly ?? [],
  };

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
      <div className="p-4 rounded-xl bg-card border border-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Today's Intake</h2>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-muted-foreground">Calories</p><p className="font-semibold">{dailyTotals.calories}</p></div>
          <div><p className="text-muted-foreground">Protein</p><p className="font-semibold">{dailyTotals.protein}g</p></div>
          <div><p className="text-muted-foreground">Carbs</p><p className="font-semibold">{dailyTotals.carbs}g</p></div>
          <div><p className="text-muted-foreground">Fat</p><p className="font-semibold">{dailyTotals.fat}g</p></div>
        </div>
      </div>

      <AdaptiveSummary {...adaptiveProps} />

      <BodyweightLogger />

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-sm text-foreground font-medium">Quick Tip</p>
        <p className="text-xs text-muted-foreground mt-1">
          Log your workouts, bodyweight and meals daily to maximise performance adaptation.
        </p>
      </div>
    </div>
  );
}
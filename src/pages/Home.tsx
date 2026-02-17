import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats } from "@/hooks/useFirestore";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";

export default function Home() {
  const { profile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const bodyweightTrend = useBodyweightTrend();
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Hey, {profile.displayName || "Athlete"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's your {mode} summary
        </p>
      </div>

      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(["weekly", "monthly"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

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

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-sm text-foreground font-medium">Quick Tip</p>
        <p className="text-xs text-muted-foreground mt-1">
          Log your workouts and meals daily to see your progress grow. Tap the "+" tab to get started!
        </p>
      </div>
    </div>
  );
}
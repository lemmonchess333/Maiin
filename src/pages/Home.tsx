import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats } from "@/hooks/useFirestore";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";
import { cn } from "@/lib/utils";

export default function Home() {
  const { profile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [compactMode, setCompactMode] = useState(false);

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Hey, {profile.displayName || "Athlete"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's your {mode} summary
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["weekly", "monthly"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCompactMode(!compactMode)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
            compactMode
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          Compact
        </button>
      </div>

      {/* Summary Card */}
      <AdaptiveSummary
        athleteType={profile.athleteType}
        mode={mode}
        compactMode={compactMode}
        weightKg={profile.weightKg}
        heightCm={profile.heightCm}
        weeklyWorkoutsDone={weeklyStats.workoutsDone}
        weeklyWorkoutsTarget={weeklyStats.workoutsTarget}
        weeklyMealsDone={weeklyStats.mealsDone}
        weeklyMealsTarget={weeklyStats.mealsTarget}
        weeklyPR={weeklyStats.hasPR}
        monthlyWorkoutsDone={monthlyStats.workoutsDone}
        monthlyWorkoutsTarget={monthlyStats.workoutsTarget}
        monthlyMealsDone={monthlyStats.mealsDone}
        monthlyMealsTarget={monthlyStats.mealsTarget}
        monthlyPR={monthlyStats.hasPR}
      />

      {/* Quick tip */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-sm text-foreground font-medium">Quick Tip</p>
        <p className="text-xs text-muted-foreground mt-1">
          Log your workouts and meals daily to see your progress grow. Tap the
          "+" tab to get started!
        </p>
      </div>
    </div>
  );
}

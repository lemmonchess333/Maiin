import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats, useBodyweightTrend } from "@/hooks/useFirestore";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";

export default function Home() {
  const { profile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const bodyweightTrend = useBodyweightTrend(); // Fetch weekly/monthly weight changes
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");

  // Determine the user’s goal (default to "recomp")
  const userGoal = profile?.goal || "recomp";

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* Greeting Section */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Hey, {profile.displayName || "Athlete"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's your {mode} summary
        </p>
      </div>

      {/* Controls Section */}
      <div className="flex gap-2">
        {/* Weekly/Monthly Mode Toggle */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {["weekly", "monthly"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Compact Mode Toggle */}
        <button
          onClick={() => setMode((prev) => (prev === "compact" ? "detailed" : "compact"))}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground"
        >
          Compact
        </button>
      </div>

      {/* Adaptive Summary Card */}
      <AdaptiveSummary
        athleteType={profile.athleteType}
        mode={mode}
        weightKg={profile.weightKg}
        heightCm={profile.heightCm}
        userGoal={userGoal} // Pass the user's goal (e.g., lean bulk, recomp, cut)
        weeklyWorkoutsDone={weeklyStats.workoutsDone}
        weeklyWorkoutsTarget={weeklyStats.workoutsTarget}
        weeklyMealsDone={weeklyStats.mealsDone}
        weeklyMealsTarget={weeklyStats.mealsTarget}
        weeklyBodyweightTrend={bodyweightTrend.weekly} // Weekly bodyweight data
        monthlyWorkoutsDone={monthlyStats.workoutsDone}
        monthlyWorkoutsTarget={monthlyStats.workoutsTarget}
        monthlyMealsDone={monthlyStats.mealsDone}
        monthlyMealsTarget={monthlyStats.mealsTarget}
        monthlyBodyweightTrend={bodyweightTrend.monthly} // Monthly bodyweight data
      />

      {/* Quick Tip Section */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-sm text-foreground font-medium">Quick Tip</p>
        <p className="text-xs text-muted-foreground mt-1">
          Log your workouts and meals daily to see your progress grow. Tap the "+" tab to get started!
        </p>
      </div>
    </div>
  );
}
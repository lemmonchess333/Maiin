import { useState } from "react";
import { cn } from "@/lib/utils";
import { Trophy, Target, Flame, Zap } from "lucide-react";

interface AdaptiveSummaryProps {
  athleteType?: string;
  mode?: "weekly" | "monthly";
  compactMode?: boolean;
  weightKg: number;
  heightCm: number;
  weeklyWorkoutsDone?: number;
  weeklyWorkoutsTarget?: number;
  weeklyMealsDone?: number;
  weeklyMealsTarget?: number;
  weeklyPR?: boolean;
  monthlyWorkoutsDone?: number;
  monthlyWorkoutsTarget?: number;
  monthlyMealsDone?: number;
  monthlyMealsTarget?: number;
  monthlyPR?: boolean;
  onWeightUnitChange?: (unit: "kg" | "lbs") => void;
  onHeightUnitChange?: (unit: "cm" | "ft") => void;
}

// Unit conversion helpers
function convertWeight(weightKg: number, unit: "kg" | "lbs"): number {
  if (unit === "lbs") return Math.round(weightKg * 2.20462);
  return weightKg;
}

function convertHeight(heightCm: number, unit: "cm" | "ft"): string {
  if (unit === "ft") {
    const totalInches = heightCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}ft ${inches}in`;
  }
  return `${heightCm}`;
}

// Progress bar component
function ProgressBar({ done, target, label }: { done: number; target: number; label: string }) {
  const ratio = Math.min(done / target, 1);
  const percentage = Math.round(ratio * 100);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{done}/{target}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Badge determination
function getBadgeInfo(newPR: boolean, workoutsDone: number, workoutsTarget: number, mealsDone: number, mealsTarget: number) {
  if (newPR) {
    return {
      badge: "PR Crusher",
      icon: Trophy,
      motivational: "New personal best logged! Small wins, huge gains.",
      achievement: "PR achieved!",
    };
  }
  if (workoutsDone >= workoutsTarget && mealsDone >= mealsTarget) {
    return {
      badge: "Consistency Champ",
      icon: Target,
      motivational: "Consistency compounds faster than motivation!",
      achievement: "Perfect consistency!",
    };
  }
  if (workoutsDone >= workoutsTarget) {
    return {
      badge: "Consistency Champ",
      icon: Target,
      motivational: "Consistency compounds faster than motivation!",
      achievement: "All workouts done!",
    };
  }
  if (mealsDone >= mealsTarget) {
    return {
      badge: "Protein Hero",
      icon: Flame,
      motivational: "Nutrition goals hit — muscle growth is tracked!",
      achievement: "Nutrition goals met!",
    };
  }
  return {
    badge: "Weekly Warrior",
    icon: Zap,
    motivational: "Keep going! Progress is built one session at a time.",
    achievement: "Keep pushing!",
  };
}

// Percentile calculation
function calculatePercentile(workoutsDone: number, workoutsTarget: number, mealsDone: number, mealsTarget: number, newPR: boolean) {
  const workoutScore = Math.min(workoutsDone / workoutsTarget, 1) * 50;
  const mealScore = Math.min(mealsDone / mealsTarget, 1) * 30;
  const PRScore = newPR ? 20 : 0;
  const performanceScore = workoutScore + mealScore + PRScore;

  if (performanceScore >= 95) return 5;
  if (performanceScore >= 85) return 10;
  if (performanceScore >= 70) return 25;
  if (performanceScore >= 50) return 50;
  return 75;
}

export function AdaptiveSummary({
  athleteType = "Lifter",
  mode = "weekly",
  compactMode = false,
  weightKg,
  heightCm,
  weeklyWorkoutsDone = 0,
  weeklyWorkoutsTarget = 4,
  weeklyMealsDone = 0,
  weeklyMealsTarget = 10,
  weeklyPR = false,
  monthlyWorkoutsDone = 0,
  monthlyWorkoutsTarget = 16,
  monthlyMealsDone = 0,
  monthlyMealsTarget = 40,
  monthlyPR = false,
  onWeightUnitChange,
  onHeightUnitChange,
}: AdaptiveSummaryProps) {
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");

  const handleWeightUnitChange = (unit: "kg" | "lbs") => {
    setWeightUnit(unit);
    onWeightUnitChange?.(unit);
  };

  const handleHeightUnitChange = (unit: "cm" | "ft") => {
    setHeightUnit(unit);
    onHeightUnitChange?.(unit);
  };

  // Select mode data
  const workoutsDone = mode === "weekly" ? weeklyWorkoutsDone : monthlyWorkoutsDone;
  const workoutsTarget = mode === "weekly" ? weeklyWorkoutsTarget : monthlyWorkoutsTarget;
  const mealsDone = mode === "weekly" ? weeklyMealsDone : monthlyMealsDone;
  const mealsTarget = mode === "weekly" ? weeklyMealsTarget : monthlyMealsTarget;
  const newPR = mode === "weekly" ? weeklyPR : monthlyPR;

  // Get badge info
  const badgeInfo = getBadgeInfo(newPR, workoutsDone, workoutsTarget, mealsDone, mealsTarget);
  const BadgeIcon = badgeInfo.icon;

  // Calculate percentile
  const percentile = calculatePercentile(workoutsDone, workoutsTarget, mealsDone, mealsTarget, newPR);

  // Unit displays
  const displayWeight = convertWeight(weightKg, weightUnit);
  const displayHeight = convertHeight(heightCm, heightUnit);
  const weightLabel = weightUnit === "lbs" ? "lbs" : "kg";
  const heightLabel = heightUnit === "ft" ? "" : "cm";

  // Athlete label for percentile
  let athleteLabel = athleteType;
  if (badgeInfo.badge === "PR Crusher") athleteLabel += " PR Crushers";
  else if (badgeInfo.badge === "Consistency Champ") athleteLabel += " Champions";
  else if (badgeInfo.badge === "Protein Hero") athleteLabel += " Nutrition Heroes";
  else athleteLabel += " Warriors";

  if (compactMode) {
    return (
      <div className="bg-card rounded-xl border border-border/50 p-4">
        <div className="flex items-center justify-between gap-3">
          {/* Badge */}
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <BadgeIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{badgeInfo.badge}</p>
              <p className="text-xs text-muted-foreground">Top {percentile}%</p>
            </div>
          </div>
          {/* Quick stats */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{workoutsDone}/{workoutsTarget} workouts</span>
            <span>{mealsDone}/{mealsTarget} meals</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="bg-muted/30 px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <BadgeIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">
              {athleteType} {mode.charAt(0).toUpperCase() + mode.slice(1)} Summary
            </h3>
            <p className="text-sm text-muted-foreground">{badgeInfo.badge}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Profile with unit pickers */}
        <div className="flex gap-4">
          {/* Weight */}
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">Weight</p>
            <p className="text-lg font-semibold text-foreground">
              {displayWeight}<span className="text-sm font-normal text-muted-foreground">{weightLabel}</span>
            </p>
            <div className="flex gap-1">
              {(["kg", "lbs"] as const).map((unit) => (
                <button
                  key={unit}
                  onClick={() => handleWeightUnitChange(unit)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-md transition-colors",
                    weightUnit === unit
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>

          {/* Height */}
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">Height</p>
            <p className="text-lg font-semibold text-foreground">
              {displayHeight}<span className="text-sm font-normal text-muted-foreground">{heightLabel}</span>
            </p>
            <div className="flex gap-1">
              {(["cm", "ft"] as const).map((unit) => (
                <button
                  key={unit}
                  onClick={() => handleHeightUnitChange(unit)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-md transition-colors",
                    heightUnit === unit
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bars */}
        <div className="space-y-3">
          <ProgressBar done={workoutsDone} target={workoutsTarget} label="Workouts" />
          <ProgressBar done={mealsDone} target={mealsTarget} label="Protein meals" />
        </div>

        {/* Achievement */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-sm font-medium text-foreground">{badgeInfo.achievement}</p>
          <p className="text-xs text-muted-foreground mt-1">{badgeInfo.motivational}</p>
        </div>

        {/* Percentile */}
        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground">
            You're in the top <span className="font-semibold text-foreground">{percentile}%</span> of {athleteLabel} this {mode}
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Trophy, Target, Flame, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { calculateProgress } from "@/utils/progressCalculator";

interface AdaptiveSummaryProps {
  athleteType?: string;
  mode?: "weekly" | "monthly";
  compactMode?: boolean;
  weightKg: number;
  heightCm: number;
  userGoal?: "lean bulk" | "cut" | "recomp";
  weeklyWorkoutsDone?: number;
  weeklyWorkoutsTarget?: number;
  weeklyMealsDone?: number;
  weeklyMealsTarget?: number;
  weeklyPR?: boolean;
  weeklyBodyweightTrend?: number[];
  monthlyWorkoutsDone?: number;
  monthlyWorkoutsTarget?: number;
  monthlyMealsDone?: number;
  monthlyMealsTarget?: number;
  monthlyPR?: boolean;
  monthlyBodyweightTrend?: number[];
  onWeightUnitChange?: (unit: "kg" | "lbs") => void;
  onHeightUnitChange?: (unit: "cm" | "ft") => void;
}

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
      motivational: "Nutrition goals hit - muscle growth is tracked!",
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
  userGoal = "recomp",
  weeklyWorkoutsDone = 0,
  weeklyWorkoutsTarget = 4,
  weeklyMealsDone = 0,
  weeklyMealsTarget = 10,
  weeklyPR = false,
  weeklyBodyweightTrend = [],
  monthlyWorkoutsDone = 0,
  monthlyWorkoutsTarget = 16,
  monthlyMealsDone = 0,
  monthlyMealsTarget = 40,
  monthlyPR = false,
  monthlyBodyweightTrend = [],
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

  const workoutsDone = mode === "weekly" ? weeklyWorkoutsDone : monthlyWorkoutsDone;
  const workoutsTarget = mode === "weekly" ? weeklyWorkoutsTarget : monthlyWorkoutsTarget;
  const mealsDone = mode === "weekly" ? weeklyMealsDone : monthlyMealsDone;
  const mealsTarget = mode === "weekly" ? weeklyMealsTarget : monthlyMealsTarget;
  const newPR = mode === "weekly" ? weeklyPR : monthlyPR;
  const bodyweightTrend = mode === "weekly" ? weeklyBodyweightTrend : monthlyBodyweightTrend;

  const badgeInfo = getBadgeInfo(newPR, workoutsDone, workoutsTarget, mealsDone, mealsTarget);
  const BadgeIcon = badgeInfo.icon;
  const percentile = calculatePercentile(workoutsDone, workoutsTarget, mealsDone, mealsTarget, newPR);

  const progress = calculateProgress({
    bodyweightTrend,
    userGoal,
  });

  const displayWeight = convertWeight(weightKg, weightUnit);
  const displayHeight = convertHeight(heightCm, heightUnit);
  const weightLabel = weightUnit === "lbs" ? "lbs" : "kg";
  const heightLabel = heightUnit === "ft" ? "" : "cm";

  let athleteLabel = athleteType;
  if (badgeInfo.badge === "PR Crusher") athleteLabel += " PR Crushers";
  else if (badgeInfo.badge === "Consistency Champ") athleteLabel += " Champions";
  else if (badgeInfo.badge === "Protein Hero") athleteLabel += " Nutrition Heroes";
  else athleteLabel += " Warriors";

  const weightChange = progress.weightChange;
  const isGaining = weightChange > 0;
  const isLosing = weightChange < 0;

  if (compactMode) {
    return (
      <div className="bg-card rounded-xl border border-border/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <BadgeIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{badgeInfo.badge}</p>
              <p className="text-xs text-muted-foreground">Top {percentile}%</p>
            </div>
          </div>
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
      <div className="bg-muted/30 px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <BadgeIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {athleteType} {mode.charAt(0).toUpperCase() + mode.slice(1)} Summary
            </h3>
            <p className="text-sm text-muted-foreground">{badgeInfo.badge}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">Weight</p>
            <p className="text-lg font-semibold text-foreground">
              {displayWeight}<span className="text-sm font-normal text-muted-foreground"> {weightLabel}</span>
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

          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">Height</p>
            <p className="text-lg font-semibold text-foreground">
              {displayHeight}<span className="text-sm font-normal text-muted-foreground"> {heightLabel}</span>
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

        <div className="space-y-3">
          <ProgressBar done={workoutsDone} target={workoutsTarget} label="Workouts" />
          <ProgressBar done={mealsDone} target={mealsTarget} label="Protein meals" />
        </div>

        {bodyweightTrend.length > 0 && (
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">AI Macro Targets</p>
              <div className="flex items-center gap-1 text-xs">
                {isGaining ? (
                  <><TrendingUp className="w-3.5 h-3.5 text-green-500" /><span className="text-green-500">+{weightChange.toFixed(1)}kg</span></>
                ) : isLosing ? (
                  <><TrendingDown className="w-3.5 h-3.5 text-blue-500" /><span className="text-blue-500">{weightChange.toFixed(1)}kg</span></>
                ) : (
                  <span className="text-muted-foreground">Stable</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-orange-50 rounded-lg p-2">
                <p className="text-lg font-bold text-orange-600">{progress.calorieBase}</p>
                <p className="text-xs text-orange-500">cal</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-lg font-bold text-blue-600">{progress.macros.protein}g</p>
                <p className="text-xs text-blue-500">protein</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-600">{progress.macros.carbs}g</p>
                <p className="text-xs text-amber-500">carbs</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-2">
                <p className="text-lg font-bold text-purple-600">{progress.macros.fat}g</p>
                <p className="text-xs text-purple-500">fat</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-sm font-medium text-foreground">{badgeInfo.achievement}</p>
          <p className="text-xs text-muted-foreground mt-1">{badgeInfo.motivational}</p>
        </div>

        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground">
            You're in the top <span className="font-semibold text-foreground">{percentile}%</span> of {athleteLabel} this {mode}
          </p>
        </div>
      </div>
    </div>
  );
}
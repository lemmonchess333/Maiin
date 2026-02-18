import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Target,
  Flame,
  Zap,
  TrendingUp,
  TrendingDown,
  Lock,
  ChevronDown,
} from "lucide-react";
import { useSubscription, pricing } from "@/lib/subscription";

/* ================================
   PHASE MODE CONFIG
================================ */

type PhaseMode = "lean bulk" | "cut" | "recomp" | "strength peak";

const phaseConfig: Record<PhaseMode, {
  calorieMultiplier: number;
  proteinRatio: number;
  fatRatio: number;
  plateauSensitivity: number;
}> = {
  "lean bulk": {
    calorieMultiplier: 1.1,
    proteinRatio: 2.2,
    fatRatio: 0.25,
    plateauSensitivity: 1,
  },
  cut: {
    calorieMultiplier: 0.85,
    proteinRatio: 2.4,
    fatRatio: 0.3,
    plateauSensitivity: 0.8,
  },
  recomp: {
    calorieMultiplier: 1,
    proteinRatio: 2.3,
    fatRatio: 0.25,
    plateauSensitivity: 1.2,
  },
  "strength peak": {
    calorieMultiplier: 1.15,
    proteinRatio: 2.2,
    fatRatio: 0.25,
    plateauSensitivity: 1.5,
  },
};

/* ================================
   PLATEAU DETECTION ENGINE
================================ */

interface PlateauResult {
  status: "progressing" | "stalling" | "regressing" | "weight_only";
  message: string;
  calorieAdjust: number;
  volumeAdjust: number;
  macroNote: string;
}

function detectPlateau(
  avgLiftChange: number,
  avgWeightChange: number,
  sensitivity: number
): PlateauResult {
  const threshold = 0.1 * sensitivity;

  if (avgLiftChange < -threshold) {
    return {
      status: "regressing",
      message: "Strength declining. Consider a deload week or reduce volume by 10%.",
      calorieAdjust: 100,
      volumeAdjust: -0.1,
      macroNote: "Increase carbs slightly to support recovery.",
    };
  }

  if (Math.abs(avgLiftChange) < threshold && Math.abs(avgWeightChange) < 0.2) {
    return {
      status: "stalling",
      message: "Performance stagnant. Increase calories by ~150 to break plateau.",
      calorieAdjust: 150,
      volumeAdjust: 0,
      macroNote: "Add 20-30g carbs around training.",
    };
  }

  if (avgWeightChange > 0.4 && avgLiftChange < threshold) {
    return {
      status: "weight_only",
      message: "Weight rising without strength gains. Shift macros toward protein and carbs.",
      calorieAdjust: -100,
      volumeAdjust: 0,
      macroNote: "Reduce fat by 10g, increase protein by 15g.",
    };
  }

  return {
    status: "progressing",
    message: "Progress trending well. Stay consistent with current plan.",
    calorieAdjust: 0,
    volumeAdjust: 0,
    macroNote: "No changes needed.",
  };
}

/* ================================
   AI MACRO ADJUSTMENT ENGINE
================================ */

interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function calculateAdaptiveMacros(
  bodyweight: number,
  avgLiftChange: number,
  avgWeightChange: number,
  phase: PhaseMode
): MacroTargets {
  const config = phaseConfig[phase];

  let baseCalories = bodyweight * 33;

  if (avgLiftChange <= 0 && avgWeightChange <= 0) {
    baseCalories += 150;
  }
  if (avgWeightChange > 0.5 && avgLiftChange <= 0) {
    baseCalories -= 100;
  }

  const adjustedCalories = Math.round(baseCalories * config.calorieMultiplier);
  const protein = Math.round(bodyweight * config.proteinRatio);
  const fats = Math.round((adjustedCalories * config.fatRatio) / 9);
  const carbs = Math.round((adjustedCalories - protein * 4 - fats * 9) / 4);

  return {
    calories: adjustedCalories,
    protein,
    carbs: Math.max(carbs, 50),
    fat: fats,
  };
}

/* ================================
   BADGE SYSTEM
================================ */

function getBadgeInfo(
  newPR: boolean,
  workoutsDone: number,
  workoutsTarget: number,
  mealsDone: number,
  mealsTarget: number
) {
  if (newPR) {
    return { badge: "PR Crusher", icon: Trophy, motivational: "New personal best! Small wins, huge gains." };
  }
  if (workoutsDone >= workoutsTarget && mealsDone >= mealsTarget) {
    return { badge: "Consistency Champ", icon: Target, motivational: "Consistency compounds faster than motivation!" };
  }
  if (workoutsDone >= workoutsTarget) {
    return { badge: "Iron Regular", icon: Target, motivational: "All workouts done. Keep the nutrition tight!" };
  }
  if (mealsDone >= mealsTarget) {
    return { badge: "Protein Hero", icon: Flame, motivational: "Nutrition goals hit. Muscle growth is on track!" };
  }
  return { badge: "Weekly Warrior", icon: Zap, motivational: "Keep going! Progress is built one session at a time." };
}

/* ================================
   PROGRESS BAR
================================ */

function ProgressBar({ done, target, label }: { done: number; target: number; label: string }) {
  const ratio = Math.min(done / Math.max(target, 1), 1);
  const pct = Math.round(ratio * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{done}/{target}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

/* ================================
   MAIN COMPONENT
================================ */

interface AdaptiveSummaryProps {
  athleteType?: string;
  mode?: "weekly" | "monthly";
  weightKg: number;
  heightCm: number;
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
}

export function AdaptiveSummary({
  athleteType = "Lifter",
  mode = "weekly",
  weightKg,
  heightCm: _heightCm,
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
}: AdaptiveSummaryProps) {
  const { tier } = useSubscription();
  const isPro = tier === "pro";

  const [phase, setPhase] = useState<PhaseMode>("recomp");

  const workoutsDone = mode === "weekly" ? weeklyWorkoutsDone : monthlyWorkoutsDone;
  const workoutsTarget = mode === "weekly" ? weeklyWorkoutsTarget : monthlyWorkoutsTarget;
  const mealsDone = mode === "weekly" ? weeklyMealsDone : monthlyMealsDone;
  const mealsTarget = mode === "weekly" ? weeklyMealsTarget : monthlyMealsTarget;
  const newPR = mode === "weekly" ? weeklyPR : monthlyPR;
  const bodyweightTrend = mode === "weekly" ? weeklyBodyweightTrend : monthlyBodyweightTrend;

  const badgeInfo = getBadgeInfo(newPR, workoutsDone, workoutsTarget, mealsDone, mealsTarget);
  const BadgeIcon = badgeInfo.icon;

  const avgWeightChange =
    bodyweightTrend.length > 0
      ? bodyweightTrend.slice(-3).reduce((a, b) => a + b, 0) / Math.max(bodyweightTrend.slice(-3).length, 1)
      : 0;

  const avgLiftChange = newPR ? 1 : 0;

  const config = phaseConfig[phase];
  const plateau = detectPlateau(avgLiftChange, avgWeightChange, config.plateauSensitivity);
  const macros = calculateAdaptiveMacros(weightKg, avgLiftChange, avgWeightChange, phase);

  const weightTrending = avgWeightChange > 0.1 ? "up" : avgWeightChange < -0.1 ? "down" : "stable";

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="bg-muted/30 px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <BadgeIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">
              {athleteType} {mode.charAt(0).toUpperCase() + mode.slice(1)} Summary
            </h3>
            <p className="text-sm text-muted-foreground">{badgeInfo.badge}</p>
          </div>
          {weightTrending !== "stable" && (
            <div className="flex items-center gap-1 text-xs">
              {weightTrending === "up" ? (
                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
              )}
              <span className={weightTrending === "up" ? "text-green-500" : "text-blue-500"}>
                {avgWeightChange > 0 ? "+" : ""}{avgWeightChange.toFixed(1)}kg
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* FREE: Progress Bars */}
        <div className="space-y-3">
          <ProgressBar done={workoutsDone} target={workoutsTarget} label="Workouts" />
          <ProgressBar done={mealsDone} target={mealsTarget} label="Protein meals" />
        </div>

        {/* FREE: Badge/Motivation */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-xs text-muted-foreground">{badgeInfo.motivational}</p>
        </div>

        {/* PRO GATE */}
        {!isPro && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border text-center space-y-3">
            <Lock className="mx-auto w-5 h-5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Unlock Performance Engine</p>
            <p className="text-xs text-muted-foreground">
              AI macro adjustments, plateau detection, phase modes, and performance insights.
            </p>
            <p className="text-xs font-semibold text-foreground">
              {"\u00A3"}{pricing.monthly}/month or {"\u00A3"}{pricing.yearly}/year
            </p>
          </div>
        )}

        {/* PRO: Phase Selector + AI Engine */}
        {isPro && (
          <>
            {/* Phase Selector */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Training Phase</p>
              <div className="relative">
                <select
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as PhaseMode)}
                  className="appearance-none text-xs px-3 py-1.5 pr-7 rounded-lg border border-border bg-muted text-foreground"
                >
                  <option value="lean bulk">Lean Bulk</option>
                  <option value="cut">Cut</option>
                  <option value="recomp">Recomp</option>
                  <option value="strength peak">Strength Peak</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Plateau Insight */}
            <div className={cn(
              "p-4 rounded-xl border",
              plateau.status === "progressing" ? "bg-green-50 border-green-200" :
              plateau.status === "stalling" ? "bg-amber-50 border-amber-200" :
              plateau.status === "regressing" ? "bg-red-50 border-red-200" :
              "bg-blue-50 border-blue-200"
            )}>
              <p className="text-sm font-medium text-foreground">Performance Insight</p>
              <p className="text-xs text-muted-foreground mt-1">{plateau.message}</p>
              {plateau.macroNote !== "No changes needed." && (
                <p className="text-xs text-muted-foreground mt-1 italic">{plateau.macroNote}</p>
              )}
            </div>

            {/* AI Macro Targets */}
            <div>
              <p className="text-sm font-medium text-foreground mb-3">AI Macro Targets</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-orange-600">{macros.calories}</p>
                  <p className="text-xs text-orange-500">cal</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-blue-600">{macros.protein}g</p>
                  <p className="text-xs text-blue-500">protein</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-amber-600">{macros.carbs}g</p>
                  <p className="text-xs text-amber-500">carbs</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-purple-600">{macros.fat}g</p>
                  <p className="text-xs text-purple-500">fat</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
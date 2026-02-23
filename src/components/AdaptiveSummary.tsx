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
  Beef,
  Wheat,
  Cookie,
} from "lucide-react";
import { motion } from "framer-motion";
import { useSubscription, pricing } from "@/lib/subscription";
import { toast } from "sonner";

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
   SAFE NUMBER HELPER
================================ */

function safeNum(val: unknown, fallback: number = 0): number {
  if (typeof val === "number" && !isNaN(val) && isFinite(val)) return val;
  return fallback;
}

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
  const bw = safeNum(bodyweight, 70);

  let baseCalories = bw * 33;

  if (avgLiftChange <= 0 && avgWeightChange <= 0) {
    baseCalories += 150;
  }
  if (avgWeightChange > 0.5 && avgLiftChange <= 0) {
    baseCalories -= 100;
  }

  const adjustedCalories = Math.round(baseCalories * config.calorieMultiplier);
  const protein = Math.round(bw * config.proteinRatio);
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
   PERCENTILE
================================ */

function calculatePercentile(
  workoutsDone: number,
  workoutsTarget: number,
  mealsDone: number,
  mealsTarget: number,
  newPR: boolean
) {
  const workoutScore = Math.min(workoutsDone / Math.max(workoutsTarget, 1), 1) * 50;
  const mealScore = Math.min(mealsDone / Math.max(mealsTarget, 1), 1) * 30;
  const PRScore = newPR ? 20 : 0;
  const performanceScore = workoutScore + mealScore + PRScore;

  if (performanceScore >= 95) return 5;
  if (performanceScore >= 85) return 10;
  if (performanceScore >= 70) return 25;
  if (performanceScore >= 50) return 50;
  return 75;
}

/* ================================
   PROGRESS BAR
================================ */

function ProgressBar({ done, target, label }: { done: number; target: number; label: string }) {
  const safeDone = safeNum(done);
  const safeTarget = safeNum(target, 1);
  const ratio = Math.min(safeDone / Math.max(safeTarget, 1), 1);
  const pct = Math.round(ratio * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{safeDone}/{safeTarget}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full bg-primary rounded-full"
        />
      </div>
    </div>
  );
}

/* ================================
   TINT HELPER (for clean tinted backgrounds)
================================ */

function tint(hex: string, factor: number = 0.85): string {
  if (!hex || !hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
  const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
  const newB = Math.min(255, Math.floor(b + (255 - b) * factor));

  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

/* ================================
   MAIN COMPONENT
================================ */

interface AdaptiveSummaryProps {
  athleteType?: string;
  mode?: "weekly" | "monthly";
  weightKg?: number;
  heightCm?: number;
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
  weightKg = 70,
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
  const { isPro } = useSubscription();

  const [phase, setPhase] = useState<PhaseMode>("recomp");
  const [calorieBoost, setCalorieBoost] = useState(0); // Applied suggestion boost

  const workoutsDone = safeNum(mode === "weekly" ? weeklyWorkoutsDone : monthlyWorkoutsDone);
  const workoutsTarget = safeNum(mode === "weekly" ? weeklyWorkoutsTarget : monthlyWorkoutsTarget, 4);
  const mealsDone = safeNum(mode === "weekly" ? weeklyMealsDone : monthlyMealsDone);
  const mealsTarget = safeNum(mode === "weekly" ? weeklyMealsTarget : monthlyMealsTarget, 10);
  const newPR = mode === "weekly" ? weeklyPR : monthlyPR;
  const bodyweightTrend = (mode === "weekly" ? weeklyBodyweightTrend : monthlyBodyweightTrend) || [];

  const badgeInfo = getBadgeInfo(newPR, workoutsDone, workoutsTarget, mealsDone, mealsTarget);
  const BadgeIcon = badgeInfo.icon;
  const percentile = calculatePercentile(workoutsDone, workoutsTarget, mealsDone, mealsTarget, newPR);

  const recentWeights = bodyweightTrend.slice(-3).filter((v) => typeof v === "number" && !isNaN(v));
  const avgWeightChange = recentWeights.length > 0
    ? recentWeights.reduce((a, b) => a + b, 0) / recentWeights.length
    : 0;

  const avgLiftChange = newPR ? 1 : 0;

  const config = phaseConfig[phase];
  const plateau = detectPlateau(avgLiftChange, avgWeightChange, config.plateauSensitivity);
  const macros = calculateAdaptiveMacros(safeNum(weightKg, 70), avgLiftChange, avgWeightChange, phase);

  // Display macros with applied boost (from "Apply Suggestion" button)
  const displayMacros = {
    ...macros,
    calories: macros.calories + calorieBoost,
  };

  const weightTrending = avgWeightChange > 0.1 ? "up" : avgWeightChange < -0.1 ? "down" : "stable";

  let athleteLabel = athleteType;
  if (badgeInfo.badge === "PR Crusher") athleteLabel += " PR Crushers";
  else if (badgeInfo.badge === "Consistency Champ") athleteLabel += " Champions";
  else if (badgeInfo.badge === "Protein Hero") athleteLabel += " Nutrition Heroes";
  else athleteLabel += " Warriors";

  const showApplyButton = isPro && plateau.calorieAdjust !== 0;

  // Light pastel macro colors (exact match to Today's Intake)
  const macroColors = {
    calories: "#f97316",
    protein: "#3b82f6",
    carbs: "#f59e0b",
    fat: "#a855f6",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border/50 overflow-hidden"
    >
      {/* Header - Lifter Weekly Summary now pure white (no purple tint) */}
      <div className="px-5 py-4 border-b border-border/30 bg-white">
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
                {avgWeightChange > 0 ? "+" : ""}{safeNum(avgWeightChange).toFixed(1)}kg
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Progress Bars */}
        <div className="space-y-3">
          <ProgressBar
            done={workoutsDone}
            target={workoutsTarget}
            label="Workouts"
          />
          <ProgressBar
            done={mealsDone}
            target={mealsTarget}
            label="Protein meals"
          />
        </div>

        {/* Badge/Motivation */}
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

            {/* Performance Insight - now pure white (no colored backgrounds) */}
            <div className="bg-white rounded-3xl p-6 border border-border/50 shadow-sm">
              <p className="text-sm font-medium text-foreground">Performance Insight</p>
              <p className="text-xs text-muted-foreground mt-1">{plateau.message}</p>
              {plateau.macroNote !== "No changes needed." && (
                <p className="text-xs text-muted-foreground mt-1 italic">{plateau.macroNote}</p>
              )}

              {showApplyButton && (
                <button
                  onClick={() => {
                    setCalorieBoost((prev) => prev + plateau.calorieAdjust);
                    toast.success(
                      `Suggestion applied! +${plateau.calorieAdjust} cal added to targets. ${plateau.macroNote}`
                    );
                  }}
                  className="mt-3 w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 active:bg-primary/95 transition-all shadow-sm"
                >
                  Apply Suggestion (+{plateau.calorieAdjust} cal)
                </button>
              )}
            </div>

            {/* AI Macro Targets - exact same light pastel style as Today's Intake */}
            <div>
              <p className="text-sm font-medium text-foreground mb-4">AI Macro Targets</p>
              <div className="grid grid-cols-4 gap-3 text-center">
                {/* Calories */}
                <div
                  className="rounded-xl p-4 shadow-sm"
                  style={{
                    backgroundColor: tint(macroColors.calories),
                    color: macroColors.calories,
                  }}
                >
                  <Flame className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-2xl font-bold">
                    {displayMacros.calories}
                  </p>
                  <p className="text-xs">cal</p>
                </div>

                {/* Protein */}
                <div
                  className="rounded-xl p-4 shadow-sm"
                  style={{
                    backgroundColor: tint(macroColors.protein),
                    color: macroColors.protein,
                  }}
                >
                  <Beef className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-2xl font-bold">
                    {displayMacros.protein}g
                  </p>
                  <p className="text-xs">protein</p>
                </div>

                {/* Carbs */}
                <div
                  className="rounded-xl p-4 shadow-sm"
                  style={{
                    backgroundColor: tint(macroColors.carbs),
                    color: macroColors.carbs,
                  }}
                >
                  <Wheat className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-2xl font-bold">
                    {displayMacros.carbs}g
                  </p>
                  <p className="text-xs">carbs</p>
                </div>

                {/* Fat */}
                <div
                  className="rounded-xl p-4 shadow-sm"
                  style={{
                    backgroundColor: tint(macroColors.fat),
                    color: macroColors.fat,
                  }}
                >
                  <Cookie className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-2xl font-bold">
                    {displayMacros.fat}g
                  </p>
                  <p className="text-xs">fat</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Percentile */}
        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground">
            You're in the top{" "}
            <span className="font-semibold text-foreground">{percentile}%</span>{" "}
            of {athleteLabel} this {mode}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
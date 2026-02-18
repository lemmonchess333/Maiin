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
} from "lucide-react";
import { calculateProgress } from "@/utils/progressCalculator";

/* ================================
   MONETISATION CONFIG
================================ */

export const pricing = {
  monthly: 2.99,
  yearly: 29.99,
};

type Tier = "free" | "pro";

/* ⚠️ Replace later with real subscription hook */
function useSubscription(): { tier: Tier } {
  return { tier: "free" }; // change to "pro" to test
}

/* ================================
   PHASE MODE CONFIG
================================ */

type PhaseMode = "lean bulk" | "cut" | "recomp" | "strength peak";

const phaseConfig = {
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
   PLATEAU ENGINE
================================ */

function detectPlateau(avgLiftChange: number, avgWeightChange: number) {
  if (avgLiftChange === 0 && avgWeightChange === 0) {
    return {
      message: "Performance stagnant. Increase calories by ~150.",
      volumeAdjustment: 0,
    };
  }

  if (avgWeightChange > 0.4 && avgLiftChange === 0) {
    return {
      message:
        "Weight rising without strength gains. Shift macros toward carbs.",
      volumeAdjustment: 0,
    };
  }

  if (avgLiftChange < 0) {
    return {
      message: "Strength declining. Reduce volume by 10% this week.",
      volumeAdjustment: -0.1,
    };
  }

  return {
    message: "Progress trending well. Stay consistent.",
    volumeAdjustment: 0,
  };
}

/* ================================
   INTELLIGENT MACRO ENGINE
================================ */

function calculateAdaptiveMacros(
  bodyweight: number,
  avgLiftChange: number,
  avgWeightChange: number,
  phase: PhaseMode
) {
  const config = phaseConfig[phase];

  let baseCalories = bodyweight * 33;

  // performance logic
  if (avgLiftChange <= 0 && avgWeightChange <= 0) {
    baseCalories += 150;
  }

  if (avgWeightChange > 0.5 && avgLiftChange <= 0) {
    baseCalories -= 100;
  }

  const adjustedCalories = baseCalories * config.calorieMultiplier;

  const protein = bodyweight * config.proteinRatio;
  const fats = (adjustedCalories * config.fatRatio) / 9;
  const carbs =
    (adjustedCalories - protein * 4 - fats * 9) / 4;

  return {
    calories: Math.round(adjustedCalories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fats),
  };
}

/* ================================
   MAIN COMPONENT
================================ */

interface AdaptiveSummaryProps {
  athleteType?: string;
  mode?: "weekly" | "monthly";
  weightKg: number;
  heightCm: number;
  weeklyPR?: boolean;
  weeklyBodyweightTrend?: number[];
  monthlyPR?: boolean;
  monthlyBodyweightTrend?: number[];
}

export function AdaptiveSummary({
  athleteType = "Lifter",
  mode = "weekly",
  weightKg,
  heightCm,
  weeklyPR = false,
  weeklyBodyweightTrend = [],
  monthlyPR = false,
  monthlyBodyweightTrend = [],
}: AdaptiveSummaryProps) {
  const { tier } = useSubscription();
  const isPro = tier === "pro";

  const [phase, setPhase] = useState<PhaseMode>("lean bulk");

  const bodyweightTrend =
    mode === "weekly"
      ? weeklyBodyweightTrend
      : monthlyBodyweightTrend;

  const newPR = mode === "weekly" ? weeklyPR : monthlyPR;

  const avgWeightChange =
    bodyweightTrend.slice(-3).reduce((a, b) => a + b, 0) /
      Math.max(bodyweightTrend.slice(-3).length, 1) || 0;

  const avgLiftChange = newPR ? 1 : 0;

  const plateau = detectPlateau(avgLiftChange, avgWeightChange);

  const macros = calculateAdaptiveMacros(
    weightKg,
    avgLiftChange,
    avgWeightChange,
    phase
  );

  /* ================================
     UI
  ================================= */

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
      <div className="p-5 space-y-5">

        {/* Phase Selector */}
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-foreground">
            Performance Engine
          </h3>

          {isPro && (
            <select
              value={phase}
              onChange={(e) =>
                setPhase(e.target.value as PhaseMode)
              }
              className="text-xs p-2 rounded-md border"
            >
              <option value="lean bulk">Lean Bulk</option>
              <option value="cut">Cut</option>
              <option value="recomp">Recomp</option>
              <option value="strength peak">
                Strength Peak
              </option>
            </select>
          )}
        </div>

        {/* FREE TIER GATE */}
        {!isPro && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border text-center space-y-3">
            <Lock className="mx-auto w-5 h-5 text-muted-foreground" />
            <p className="text-sm font-medium">
              Unlock Adaptive Performance Engine
            </p>
            <p className="text-xs text-muted-foreground">
              AI macro adjustments, plateau detection, and phase modes.
            </p>
            <p className="text-xs font-semibold">
              £{pricing.monthly}/month or £{pricing.yearly}/year
            </p>
          </div>
        )}

        {/* PRO LOGIC */}
        {isPro && (
          <>
            {/* Plateau Feedback */}
            <div className="p-4 rounded-xl bg-muted/30">
              <p className="text-sm font-medium">
                Performance Insight
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {plateau.message}
              </p>
            </div>

            {/* Macro Targets */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-lg font-bold text-orange-600">
                  {macros.calories}
                </p>
                <p className="text-xs text-orange-500">
                  calories
                </p>
              </div>

              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-lg font-bold text-blue-600">
                  {macros.protein}g
                </p>
                <p className="text-xs text-blue-500">
                  protein
                </p>
              </div>

              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-lg font-bold text-amber-600">
                  {macros.carbs}g
                </p>
                <p className="text-xs text-amber-500">
                  carbs
                </p>
              </div>

              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-lg font-bold text-purple-600">
                  {macros.fat}g
                </p>
                <p className="text-xs text-purple-500">
                  fat
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
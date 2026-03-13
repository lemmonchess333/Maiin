/* ─────────────────────────────────────────────
   Plateau Detection & AI Macro Adjustment Utils
   Extracted from AdaptiveSummary.tsx
   ───────────────────────────────────────────── */

export type PhaseMode = "lean bulk" | "cut" | "recomp" | "strength peak";

export const phaseConfig: Record<
  PhaseMode,
  {
    calorieMultiplier: number;
    proteinRatio: number;
    fatRatio: number;
    plateauSensitivity: number;
  }
> = {
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

export interface PlateauResult {
  status: "progressing" | "stalling" | "regressing" | "weight_only";
  message: string;
  calorieAdjust: number;
  volumeAdjust: number;
  macroNote: string;
}

export function detectPlateau(
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

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function safeNum(val: unknown, fallback: number = 0): number {
  if (typeof val === "number" && !isNaN(val) && isFinite(val)) return val;
  return fallback;
}

export function calculateAdaptiveMacros(
  bodyweight: number,
  avgLiftChange: number,
  avgWeightChange: number,
  phase: PhaseMode,
  baseTDEE?: number
): MacroTargets {
  const config = phaseConfig[phase];
  const bw = safeNum(bodyweight, 70);

  const baseCalories = baseTDEE ?? bw * 33;

  let adjustment = 0;
  if (avgLiftChange <= 0 && avgWeightChange <= 0) adjustment += 150;
  if (avgWeightChange > 0.5 && avgLiftChange <= 0) adjustment -= 100;

  const adjustedCalories = Math.round((baseCalories + adjustment) * config.calorieMultiplier);
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

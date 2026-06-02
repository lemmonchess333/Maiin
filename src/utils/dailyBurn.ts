import type { FitnessGoal } from "@/lib/tdee";

/**
 * Daily calorie summary for the Home "Today's Energy" card.
 *
 * The target (phaseAdjustedTdee) is the user's stored targetCalories from the
 * profile — written by onboarding / Settings via calculateTDEE, which already
 * bakes in the user's activityLevel multiplier AND the phase deficit.
 *
 * Nutr1 (expenditure-inclusive): completed activity is NEVER added back to the
 * target — the stored TDEE already accounts for it. `workoutCalories` /
 * `runCalories` / `stepCalories` are carried here purely for INFORMATIONAL
 * display ("burned X — already in your target"); there is no eat-back budget.
 */
export interface DailyBurn {
  /** Profile's stored target — already includes activity-level TDEE + phase deficit. */
  phaseAdjustedTdee: number;
  /** Informational only — calories burned, NOT added to the target. */
  workoutCalories: number;
  /** Informational only — calories burned, NOT added to the target. */
  runCalories: number;
  /** Informational only — calories burned, NOT added to the target. */
  stepCalories: number;
  phase: FitnessGoal;
  phaseLabel: string;
}

export function calcDailyBurn(
  targetCalories: number,
  phase: FitnessGoal,
  workoutCals: number,
  runCals: number,
  stepCals: number
): DailyBurn {
  const phaseAdjustedTdee = targetCalories;

  const phaseLabel =
    phase === "cut" ? "cut" : phase === "lean bulk" ? "bulk" : "recomp";

  return {
    phaseAdjustedTdee,
    workoutCalories: workoutCals,
    runCalories: runCals,
    stepCalories: stepCals,
    phase,
    phaseLabel,
  };
}

export function estimateStepCalories(steps: number, weightKg: number): number {
  const calPerStep = 0.04 * (weightKg / 70);
  return Math.round(steps * calPerStep);
}

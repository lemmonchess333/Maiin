import type { FitnessGoal } from "@/lib/tdee";

/**
 * Daily calorie burn summary for the Home "Today's Energy" card.
 *
 * The base (phaseAdjustedTdee) is the user's stored targetCalories from the
 * profile — written by onboarding / Settings via calculateTDEE, which already
 * bakes in the user's activityLevel multiplier AND the phase deficit. This
 * function therefore does NOT recompute NEAT or re-apply the goal offset; it
 * just sums the phase-adjusted base with on-top burn sources.
 */
export interface DailyBurn {
  /** Profile's stored target — already includes activity-level TDEE + phase deficit. */
  phaseAdjustedTdee: number;
  workoutCalories: number;
  runCalories: number;
  stepCalories: number;
  dailyBudget: number;
  phase: FitnessGoal;
  phaseLabel: string;
}

export function calcDailyBurn(
  targetCalories: number,
  phase: FitnessGoal,
  workoutCals: number,
  runCals: number,
  stepCals: number,
): DailyBurn {
  const phaseAdjustedTdee = targetCalories;
  const dailyBudget = phaseAdjustedTdee + workoutCals + runCals + stepCals;

  const phaseLabel = phase === "cut" ? "cut" : phase === "lean bulk" ? "bulk" : "recomp";

  return {
    phaseAdjustedTdee,
    workoutCalories: workoutCals,
    runCalories: runCals,
    stepCalories: stepCals,
    dailyBudget,
    phase,
    phaseLabel,
  };
}

export function estimateStepCalories(steps: number, weightKg: number): number {
  const calPerStep = 0.04 * (weightKg / 70);
  return Math.round(steps * calPerStep);
}

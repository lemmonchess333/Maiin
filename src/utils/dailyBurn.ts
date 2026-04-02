import type { FitnessGoal } from "@/lib/tdee";
import { GOAL_CALORIE_OFFSET } from "@/lib/macroConstants";

/** NEAT multiplier — covers thermic effect of food + basic daily movement.
 *  Structured exercise is added explicitly via workoutCals/runCals/stepCals. */
const NEAT_MULTIPLIER = 1.2;

export interface DailyBurn {
  bmr: number;
  tdee: number;
  phaseAdjustedTdee: number;
  workoutCalories: number;
  runCalories: number;
  stepCalories: number;
  dailyBudget: number;
  phase: FitnessGoal;
  phaseLabel: string;
}

export function calcDailyBurn(
  bmr: number,
  phase: FitnessGoal,
  workoutCals: number,
  runCals: number,
  stepCals: number,
): DailyBurn {
  const tdee = Math.round(bmr * NEAT_MULTIPLIER);
  const phaseAdjustedTdee = tdee + (GOAL_CALORIE_OFFSET[phase] ?? 0);
  const dailyBudget = phaseAdjustedTdee + workoutCals + runCals + stepCals;

  const phaseLabel = phase === "cut" ? "cut" : phase === "lean bulk" ? "bulk" : "recomp";

  return {
    bmr,
    tdee,
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

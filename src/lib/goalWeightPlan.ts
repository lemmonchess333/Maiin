import type { FitnessGoal } from "./tdee";
import { offsetFromWeeklyRate } from "./macroConstants";

/**
 * Goal-weight + rate → nutrition direction (Tier 2).
 *
 * Locked product decision: the TARGET WEIGHT owns the nutrition direction
 * (MFP / MacroFactor model), not the training `primaryGoal`. So "Build
 * muscle" with a target weight BELOW current honestly resolves to a slight
 * deficit (a real recomp / mini-cut scenario) instead of silently forcing a
 * surplus. `primaryGoal` continues to drive the LIFTING programme only.
 *
 * Direction is set by target vs current weight with a deadband, so a target
 * within ~1kg of current reads as "maintain at current weight" (recomp) — it
 * avoids a 0.2kg target nudge flipping the user into a cut/bulk.
 */

/** Targets within this many kg of current weight count as "maintain". */
export const MAINTAIN_DEADBAND_KG = 1;

export type WeightDirection = "lose" | "gain" | "maintain";

export function directionForTarget(
  currentKg: number,
  targetKg: number,
  deadbandKg: number = MAINTAIN_DEADBAND_KG
): WeightDirection {
  const delta = targetKg - currentKg;
  if (delta < -deadbandKg) return "lose";
  if (delta > deadbandKg) return "gain";
  return "maintain";
}

/** Map a weight direction to the engine's FitnessGoal (nutrition phase). */
export function fitnessGoalForDirection(dir: WeightDirection): FitnessGoal {
  if (dir === "lose") return "cut";
  if (dir === "gain") return "lean bulk";
  return "recomp";
}

export interface GoalWeightPlan {
  direction: WeightDirection;
  fitnessGoal: FitnessGoal;
  /** Per-day calorie offset (negative = deficit, positive = surplus). */
  dailyOffset: number;
  /** Signed weekly rate actually applied (kg/week), 0 when maintaining. */
  effectiveRateKgPerWeek: number;
}

/**
 * Resolve the full nutrition plan from current weight, target weight, and a
 * desired (unsigned) weekly rate. The rate's sign is taken from the
 * direction, so callers pass a positive magnitude (e.g. 0.5) regardless of
 * lose/gain. Maintain forces rate + offset to 0.
 */
export function resolveGoalWeightPlan(args: {
  currentKg: number;
  targetKg: number;
  rateKgPerWeek: number;
  deadbandKg?: number;
}): GoalWeightPlan {
  const direction = directionForTarget(
    args.currentKg,
    args.targetKg,
    args.deadbandKg
  );
  const fitnessGoal = fitnessGoalForDirection(direction);
  if (direction === "maintain") {
    return {
      direction,
      fitnessGoal,
      dailyOffset: 0,
      effectiveRateKgPerWeek: 0,
    };
  }
  const magnitude = Math.abs(args.rateKgPerWeek);
  const signed = direction === "lose" ? -magnitude : magnitude;
  return {
    direction,
    fitnessGoal,
    dailyOffset: offsetFromWeeklyRate(signed),
    effectiveRateKgPerWeek: signed,
  };
}

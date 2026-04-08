import type { DayType } from "@/lib/types";
import { getDayAdjustment } from "@/lib/phaseNutrition";

/**
 * Pure computation helpers for training-aware calorie targets.
 *
 * The core rule is:
 *
 *   effectiveBonus = max(strategicBonus, actualBurn)
 *
 * STRATEGIC BONUS is the program's prescribed adjustment for the EFFECTIVE
 * day type (derived from completed activity, not from the schedule). These
 * are strategic nutrition recommendations, not burn estimates — the +400
 * strength-phase lift bonus is a deliberate hypertrophy over-feed.
 *
 * ACTUAL BURN is the sum of calories burned via completed workouts and runs
 * on the given date.
 *
 * MAX preserves strategic over-feeds when actual burn is smaller, rewards
 * over-performance when actual burn exceeds the strategic default, rewards
 * unscheduled extra activity, and never under-fuels.
 */

/**
 * Determine the effective day type from completed activity.
 * Falls back to the planned day type when no activity is completed.
 */
export function deriveEffectiveDayType(
  liftBurn: number,
  runBurn: number,
  plannedDayType: DayType,
): DayType {
  const hasLifts = liftBurn > 0;
  const hasRuns = runBurn > 0;
  if (hasLifts && hasRuns) return "both";
  if (hasLifts) return "lift";
  if (hasRuns) return "run";
  return plannedDayType;
}

export interface EffectiveBonusInput {
  /** Total calories burned via completed workouts on the date */
  actualLiftBurn: number;
  /** Total calories burned via completed runs on the date */
  actualRunBurn: number;
  /** Day type from the scheduled program (fallback when nothing completed) */
  plannedDayType: DayType;
  /** Current training phase (e.g. "base", "strength", "cut") */
  phase: string;
  /** Optional goal override (e.g. "cut") */
  goal?: string;
}

export interface EffectiveBonusResult {
  /** Day type after applying actual completed activity */
  effectiveDayType: DayType;
  /** Sum of lift + run burn */
  actualBurn: number;
  /** Prescribed adjustment for the effective day type (from phaseNutrition) */
  strategicBonus: number;
  /** max(strategicBonus, round(actualBurn)) */
  effectiveBonus: number;
  /** True if any workout or run contributed calories */
  hasCompletedActivity: boolean;
}

/**
 * Given completed activity and program context, compute the effective
 * calorie bonus for the day.
 *
 * This is the single source of truth for the max(strategy, reality) rule.
 * Used by useEffectiveTargets (the React hook) and covered by unit tests
 * via the 9 worked examples in effectiveTargets.test.ts.
 */
export function computeEffectiveBonus(
  input: EffectiveBonusInput,
): EffectiveBonusResult {
  const { actualLiftBurn, actualRunBurn, plannedDayType, phase, goal } = input;

  const actualBurn = actualLiftBurn + actualRunBurn;
  const hasCompletedActivity = actualBurn > 0;

  const effectiveDayType = deriveEffectiveDayType(
    actualLiftBurn,
    actualRunBurn,
    plannedDayType,
  );

  const strategicBonus = getDayAdjustment(effectiveDayType, phase, goal)
    .calorieAdjustment;

  const effectiveBonus = Math.max(strategicBonus, Math.round(actualBurn));

  return {
    effectiveDayType,
    actualBurn,
    strategicBonus,
    effectiveBonus,
    hasCompletedActivity,
  };
}

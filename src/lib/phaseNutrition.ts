import type { UserProfile } from "./auth";
import type { DayType } from "./types";
import type { ProgramState } from "@/features/program/programTypes";
import {
  resolveProteinMultiplier,
  FAT_CALORIE_FRACTION,
  ESSENTIAL_FAT_FLOOR_PER_KG,
} from "./macroConstants";
import { trainingSignalsForNutrition } from "./trainingSignals";
import { getNutritionPhase } from "./nutritionPhase";
import {
  type DayIntensity,
  fuelShiftCalsForTier,
  fatFloorPerKgForTier,
  tierFromDayType,
  describeDayIntensity,
} from "./dayIntensity";

/** Re-export for back-compat (the constant moved to macroConstants to break a
 *  phaseNutrition↔dayIntensity cycle). */
export { ESSENTIAL_FAT_FLOOR_PER_KG };

export interface AdjustedTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  annotation: string;
  /** True when the calorie target is too low to fit bodyweight protein + the
   *  essential fat floor — the cut is too aggressive. Carbs are NOT silently
   *  floored to a broken sum; protein is capped to keep the sum valid and this
   *  flag is raised so the UI can warn. */
  aggressive: boolean;
}

/**
 * The protein multiplier (g/kg) for the day. Cut goal pins 2.2 (preserve lean
 * mass in a deficit) regardless of lift phase; otherwise the Prompt-A
 * lift-phase drives it (strength 2.2 / hypertrophy 2.0 / deload 1.8 / base 2.0)
 * with the goal as fallback.
 */
function dayProteinMultiplier(phase: string, goal?: string): number {
  const isCut = goal === "cut" || (!goal && phase === "cut");
  return resolveProteinMultiplier(isCut ? "cut" : phase, goal);
}

/**
 * Daily macro split, calorie-flat (Nutr1). The fat↔carb fast-loop is driven by
 * the day-load `intensity` tier (from the dayIntensity classifier). When no
 * tier is supplied (callers without a date/runDays join, e.g. unit tests) it
 * is derived from `dayType` + the program's lift signals.
 *
 * Model:
 *  - protein: bodyweight × phase multiplier, CAPPED so it can't crowd out the
 *    essential fat floor (overshoot → `aggressive` flag).
 *  - fat: starts at the FAT_CALORIE_FRACTION baseline, cut toward the tier's
 *    fat floor by the tier's fuel shift, never below ESSENTIAL_FAT_FLOOR_PER_KG.
 *  - carbs: the balancing remainder; the fat freed by the shift becomes carbs
 *    at constant calories (net-neutral). Clamped ≥ 0.
 *
 * Invariant: protein*4 + carbs*4 + fat*9 === calories (±2 cal rounding), OR
 * `aggressive` is true on an over-budget cut.
 */
export function getAdjustedTargets(
  profile: UserProfile,
  dayType: DayType,
  program?: ProgramState,
  intensity?: DayIntensity
): AdjustedTargets {
  const calories = profile.targetCalories || 2200;
  const weightKg = profile.weightKg || 70;

  // Lift phase (Prompt A translator) → protein multiplier. Falls back to the
  // legacy currentPhase mirror when there's no lift program.
  const signals = trainingSignalsForNutrition(program);
  const phase =
    signals.liftPhase === "none"
      ? profile.program?.currentPhase || "base"
      : signals.liftPhase;
  const goal = getNutritionPhase(profile);
  const multiplier = dayProteinMultiplier(phase, goal);

  // Day-load tier drives the fat↔carb shift (replaces the per-dayType carb
  // constant). Carb DIRECTION is glycogen-demand-driven (volume + run stress),
  // NOT the strength/hypertrophy label — see dayIntensity.ts header.
  const tier = intensity ?? tierFromDayType(dayType, program);

  const essentialFatG = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * weightKg);
  const baselineFatG = Math.round((FAT_CALORIE_FRACTION * calories) / 9);

  // Cut fat from baseline toward the tier floor (≥ essential), by the shift.
  const shiftFloorG = Math.max(
    Math.round(fatFloorPerKgForTier(tier) * weightKg),
    essentialFatG
  );
  const desiredCutG = Math.round(fuelShiftCalsForTier(tier) / 9);
  const cutG = Math.max(0, Math.min(desiredCutG, baselineFatG - shiftFloorG));
  // Never below the essential floor (raises a too-low baseline UP to essential
  // on deep deficits — periodization is intentionally inert there).
  const fat = Math.max(baselineFatG - cutG, essentialFatG);

  // Protein anchored to bodyweight, capped so protein + fat fit the budget
  // (carbs ≥ 0). A cap means the cut is too aggressive to hit both → flag it.
  let aggressive = false;
  let protein = Math.round(multiplier * weightKg);
  const proteinRoomCals = calories - fat * 9;
  if (protein * 4 > proteinRoomCals) {
    protein = Math.max(0, Math.floor(proteinRoomCals / 4));
    aggressive = true;
  }

  // Carbs = balancing remainder. Clamp ≥ 0 (a forced clamp is the over-budget
  // signal too — but the protein cap above already keeps the sum valid).
  let carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  if (carbs < 0) {
    carbs = 0;
    aggressive = true;
  }

  return {
    calories,
    protein,
    carbs,
    fat,
    annotation: describeDayIntensity(tier),
    aggressive,
  };
}

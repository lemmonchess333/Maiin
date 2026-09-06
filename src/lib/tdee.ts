/**
 * TDEE Calculator using Mifflin-St Jeor equation (more accurate than Harris-Benedict).
 * Provides macro recommendations based on fitness goal.
 */

import {
  GOAL_PROTEIN,
  GOAL_CALORIE_OFFSET,
  DEFAULT_PROTEIN_MULTIPLIER,
  FAT_CALORIE_FRACTION,
  ESSENTIAL_FAT_FLOOR_PER_KG,
  floorTargetCalories,
} from "./macroConstants";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type FitnessGoal = "cut" | "recomp" | "lean bulk";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (desk job)",
  light: "Light (1-3 days/week)",
  moderate: "Moderate (3-5 days/week)",
  active: "Active (6-7 days/week)",
  very_active: "Very Active (athlete)",
};

export interface TDEEResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  deficit: number;
  /**
   * The calorie target could not fit bodyweight protein alongside the
   * essential fat floor, so `protein` is what fits rather than what the goal
   * multiplier asked for. The same condition `getAdjustedTargets` reports as
   * `aggressive` — reported here too, because the two splitters now share the
   * arithmetic and a cap the user is never told about is a target that lies.
   */
  proteinCapped: boolean;
  /** What the goal multiplier asked for, before any cap. Equals `protein`
   *  unless `proteinCapped`. */
  proteinUncapped: number;
  /**
   * The target is below what the essential fat floor alone costs at this
   * bodyweight (`minFeasibleKcal`): no protein or carbs can be funded, and
   * the grams do NOT reconcile to the target — `fat` alone exceeds it.
   * There is no smaller honest split, so it is reported rather than hidden,
   * and every surface that renders these grams must say so. A manual
   * `customCalorieTarget` of 100 kcal displayed "0 g protein · 0 g carbs ·
   * 42 g fat" as the day's goals on three screens before this flag existed.
   */
  infeasible: boolean;
  /** Essential fat kcal at this bodyweight — the smallest target the split
   *  can reconcile to. 0 when the inputs were not finite. */
  minFeasibleKcal: number;
}

/** The macro fields of a TDEE result — the split alone, without the energy
 *  arithmetic that produced the target. */
export type MacroSplit = Pick<
  TDEEResult,
  | "protein"
  | "carbs"
  | "fat"
  | "proteinCapped"
  | "proteinUncapped"
  | "infeasible"
  | "minFeasibleKcal"
>;

/**
 * Split a calorie target into grams.
 *
 * Exported because the target is not always the formula's: a manual
 * `customCalorieTarget` replaces it, and the split has to be recomputed
 * against the number actually in force. Persisting the formula's grams
 * beside an overridden calorie figure is how the profile ended up storing
 * 1400 kcal alongside a triple summing to 2209.
 *
 * The arithmetic is the SAME one `getAdjustedTargets` uses for a rest day
 * with no tier shift, in the same order, so the stored triple and the one
 * the Food page renders are the same numbers.
 *
 * History, because the near-miss is instructive. NUTR-M3 dropped a 50g carb
 * floor from this split for exactly that reason and left a comment claiming
 * it now reconciled — "protein*4 + carbs*4 + fat*9 === targetCalories". It
 * did not. Flooring carbs at 0 stops the balancing macro going NEGATIVE; it
 * does nothing about protein and fat together overrunning the budget, which
 * is the state an aggressive cut actually produces. On the worst body the
 * pace picker can reach (110 kg, sedentary, "Fast") the stored split summed
 * to 1283 kcal against a 1267 kcal target, stored 35 g of fat against a 66 g
 * essential floor, and stored 242 g of protein where the app displayed 168 g.
 *
 * The protein gap was not cosmetic: profile.targetProtein is what the
 * performance engine's adherence factor scores avgDailyProtein against
 * (perfScoring computeAdherenceScore), so a user who ate exactly what the
 * Food page asked scored 77 instead of 100 on that factor — penalised for
 * complying with their own plan.
 */
export function splitMacrosForTarget(
  targetCalories: number,
  weightKg: number,
  proteinMultiplier: number
): MacroSplit {
  // Non-finite input (a NaN weight from an empty field, an Infinity target)
  // propagated straight into the grams — NaN carbs, Infinity fat —
  // and from there into the profile. Nothing downstream can render or
  // store that honestly; return a flagged empty split instead.
  if (!Number.isFinite(targetCalories) || !Number.isFinite(weightKg)) {
    return {
      protein: 0,
      carbs: 0,
      fat: 0,
      proteinCapped: false,
      proteinUncapped: 0,
      infeasible: true,
      minFeasibleKcal: 0,
    };
  }

  const essentialFatG = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * weightKg);
  const fat = Math.max(
    Math.round((FAT_CALORIE_FRACTION * targetCalories) / 9),
    essentialFatG
  );

  // Protein anchored to bodyweight, capped so protein + fat fit the budget.
  // The cap is a reduction only — it can never prescribe more than the goal
  // multiplier asks for.
  const proteinUncapped = Math.round(proteinMultiplier * weightKg);
  let protein = proteinUncapped;
  let proteinCapped = false;
  const proteinRoomCals = targetCalories - fat * 9;
  if (protein * 4 > proteinRoomCals) {
    protein = Math.max(0, Math.floor(proteinRoomCals / 4));
    proteinCapped = true;
  }

  // Carbs are the balancing remainder, floored at 0. Derived from fat GRAMS
  // rather than the pre-rounding fat calories — the display splitter rounds
  // to grams first, and computing from the unrounded figure here put the two
  // copies a gram or two apart on ordinary profiles too.
  const carbs = Math.max(
    0,
    Math.round((targetCalories - protein * 4 - fat * 9) / 4)
  );

  // Below the essential-fat floor's own cost the split cannot reconcile:
  // fat alone exceeds the target, protein and carbs are already 0.
  const minFeasibleKcal = essentialFatG * 9;
  const infeasible = fat * 9 > targetCalories;

  return {
    protein,
    carbs,
    fat,
    proteinCapped,
    proteinUncapped,
    infeasible,
    minFeasibleKcal,
  };
}

/** The protein multiplier a goal implies, for callers that split a target
 *  outside `calculateTDEE`. */
export function proteinMultiplierForGoal(goal: FitnessGoal): number {
  return GOAL_PROTEIN[goal] ?? DEFAULT_PROTEIN_MULTIPLIER;
}

/**
 * Calculate BMR using Mifflin-St Jeor equation.
 * Male:   10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5
 * Female: 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161
 */
export function calculateTDEE(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel,
  goal: FitnessGoal,
  sex: "male" | "female" = "male",
  /**
   * Tier 2 — explicit per-day calorie offset from a user-chosen goal-weight
   * rate. When provided, it overrides the per-goal default band
   * (`GOAL_CALORIE_OFFSET[goal]`). Omitted → legacy behaviour, so all
   * existing call sites are unchanged.
   */
  explicitOffset?: number
): TDEEResult {
  const sexOffset = sex === "female" ? -161 : 5;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);

  // Goal-based adjustment: explicit rate-derived offset wins, else the
  // centralized per-goal default band.
  const requestedOffset =
    explicitOffset !== undefined
      ? explicitOffset
      : (GOAL_CALORIE_OFFSET[goal] ?? 0);
  // NUTR-L5 safety floor: a deficit can never push the target below
  // min(tdee, MIN_TARGET_CALORIES). The reported `deficit` is the EFFECTIVE
  // offset after flooring, so UI that renders "±N cal" stays honest when the
  // requested rate couldn't be applied in full.
  //
  // The floor guards the RATE-derived path only. A manual
  // `customCalorieTarget` replaces this target downstream and is bounded by
  // the profile sanitizer alone (0..10000), so it can sit below 1200. That is
  // the user's own number and is left as they set it; what the split below now
  // guarantees is that whatever the target, the grams reconcile to it and a
  // capped protein figure is reported rather than applied in silence.
  const targetCalories = floorTargetCalories(tdee + requestedOffset, tdee);
  const deficit = targetCalories - tdee;

  const {
    protein,
    carbs,
    fat,
    proteinCapped,
    proteinUncapped,
    infeasible,
    minFeasibleKcal,
  } = splitMacrosForTarget(
    targetCalories,
    weightKg,
    proteinMultiplierForGoal(goal)
  );

  return {
    bmr,
    tdee,
    targetCalories,
    protein,
    carbs,
    fat,
    deficit,
    proteinCapped,
    proteinUncapped,
    infeasible,
    minFeasibleKcal,
  };
}

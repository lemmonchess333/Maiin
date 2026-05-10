/**
 * Pre-save validation for user-entered food data.
 *
 * Applied only at user-input boundaries — manual logger, NL parser
 * results, AI photo analysis results — where fresh numeric data
 * enters the system and a typo can land an absurd entry on the
 * user's account. Database / OpenFoodFacts / barcode / quick-add /
 * copy-yesterday paths reuse already-validated data and skip this
 * helper to keep blast radius scoped.
 *
 * Two verdicts:
 *   blocked — non-finite, negative, or NaN values. Save aborted
 *             with a short field-specific error.
 *   warn    — finite positive values above the suspicious-but-
 *             possible threshold (cheat day, recipe batch, etc.).
 *             ConfirmDialog asks "Save anyway?" — never hard-block
 *             a legitimate huge meal.
 *
 * Zero is allowed and never warns (water, black coffee, herbs).
 *
 * Threshold rationale: a reasonable upper bound for a single
 * logged entry. Single-item 5000 cal / 300g protein / 600g carbs /
 * 300g fat is implausible for a non-recipe entry and almost always
 * indicates a serving-size confusion or typo. Multiple warnings
 * across fields surface the most-egregious one first by checking
 * calories before macros.
 */

export interface FoodValuesToValidate {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export type FoodValidationResult =
  | { kind: 'ok' }
  | { kind: 'blocked'; reason: string }
  | {
      kind: 'warn';
      field: 'calories' | 'protein' | 'carbs' | 'fat';
      title: string;
      description: string;
    };

export const FOOD_WARN_CALORIES = 5000;
export const FOOD_WARN_PROTEIN_G = 300;
export const FOOD_WARN_CARBS_G = 600;
export const FOOD_WARN_FAT_G = 300;

const FIELD_LABELS: Record<keyof FoodValuesToValidate, string> = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
};

function blockReason(field: keyof FoodValuesToValidate, val: number): string {
  if (Number.isNaN(val) || !Number.isFinite(val)) {
    return `${FIELD_LABELS[field]} must be a valid number.`;
  }
  return `Macros can't be negative.`;
}

export function validateFoodEntry(values: FoodValuesToValidate): FoodValidationResult {
  const fields: (keyof FoodValuesToValidate)[] = ['calories', 'protein', 'carbs', 'fat'];

  for (const field of fields) {
    const val = values[field];
    if (val === undefined || val === null) continue;
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      return { kind: 'blocked', reason: blockReason(field, val as number) };
    }
    if (val < 0) {
      return { kind: 'blocked', reason: blockReason(field, val) };
    }
  }

  const cal = values.calories ?? 0;
  if (cal > FOOD_WARN_CALORIES) {
    return {
      kind: 'warn',
      field: 'calories',
      title: `${cal} calories looks unusually high`,
      description: 'Check the serving size before saving.',
    };
  }
  const pro = values.protein ?? 0;
  if (pro > FOOD_WARN_PROTEIN_G) {
    return {
      kind: 'warn',
      field: 'protein',
      title: `${pro}g protein looks unusually high`,
      description: 'Check the serving size before saving.',
    };
  }
  const carbs = values.carbs ?? 0;
  if (carbs > FOOD_WARN_CARBS_G) {
    return {
      kind: 'warn',
      field: 'carbs',
      title: `${carbs}g carbs looks unusually high`,
      description: 'Check the serving size before saving.',
    };
  }
  const fat = values.fat ?? 0;
  if (fat > FOOD_WARN_FAT_G) {
    return {
      kind: 'warn',
      field: 'fat',
      title: `${fat}g fat looks unusually high`,
      description: 'Check the serving size before saving.',
    };
  }

  return { kind: 'ok' };
}

/**
 * Aggregate-vs-target sanity check for fresh AI/photo scans.
 *
 * The per-entry `validateFoodEntry` floor (5000 cal absolute)
 * catches obvious typos but lets a 3500 cal AI-hallucinated meal
 * through. A target-relative threshold catches those — a single
 * scan summing to >150% of the user's effective daily calorie
 * target is almost always a hallucination or a misidentified
 * recipe batch (one user's whole-day food in one photo).
 *
 * Returns `{ kind: 'warn', ... }` with copy that nudges the
 * user back to the per-item editor before they save. Returns
 * null when the check doesn't apply (no target / disabled /
 * within band) — the caller falls through to its normal save
 * path.
 *
 * Scope: AI photo only. Barcode and database results re-use
 * already-validated source data and are excluded by the call
 * site (FoodAnalyzer.saveMeal gates on
 * `meal.confidence !== "barcode"`). Quick-add / copy / duplicate
 * paths live in Food.tsx and never reach this helper.
 */
export const AGGREGATE_VS_TARGET_RATIO = 1.5;

export interface AggregateAgainstTargetResult {
  title: string;
  description: string;
}

export function checkAggregateAgainstTarget(
  totalCalories: number,
  effectiveDailyTarget: number | undefined,
): AggregateAgainstTargetResult | null {
  /* Defensive: skip if the target isn't ready yet (parent component
     loading) or if the total is non-finite. The check is a polish
     guard, not a save-blocker — never break the save flow on a
     missing target. */
  if (!Number.isFinite(totalCalories) || totalCalories <= 0) return null;
  if (!effectiveDailyTarget || !Number.isFinite(effectiveDailyTarget) || effectiveDailyTarget <= 0) {
    return null;
  }

  const limit = effectiveDailyTarget * AGGREGATE_VS_TARGET_RATIO;
  if (totalCalories <= limit) return null;

  return {
    title: 'This meal looks unusually high',
    description: `This scan totals about ${Math.round(totalCalories)} kcal, which is over a full day's target. Check the items before saving.`,
  };
}

/**
 * Shared daily-totals summer. Both Home's useHomeData (which pulls today's
 * meal docs directly from Firestore) and Food's useMeals (which sums from
 * the client-side meal cache) funnel through this function so the two
 * surfaces can't drift again — the previous bug was caused by
 * useHomeData estimating carbs/fat from a 62/38 split of leftover
 * calories while useMeals read the real values. Same doc → same totals
 * → same numbers on every surface.
 *
 * Accepts two input shapes:
 *   1. The parsed `Meal` type exported from useMeals.ts — fully typed,
 *      uses the `total*` prefix.
 *   2. Raw Firestore `d.data()` payloads from useHomeData — may use the
 *      legacy bare form (`calories`, `protein`, `carbs`, `fat`) if they
 *      were written by a much older app build.
 *
 * Each macro field prefers the prefixed form, falls back to the bare
 * form, then 0. Non-finite values (NaN, undefined, strings) coerce to 0.
 */

export interface MealTotalsInput {
  // Preferred prefixed form (every meal written by the current client).
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
  totalFiber?: number;
  totalSugar?: number;
  totalSodium?: number;
  // Legacy bare form — older docs that predate the `total*` convention.
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  // HOME-MEALS-01: soft-delete marker. Deletion is SOFT (`deletedAt` +
  // 24h restore window), so a "deleted" meal still exists as a doc.
  // useMeals filters `!deletedAt` client-side, but useHomeData reads
  // today's docs straight from Firestore with no such filter and fed
  // every raw doc here — so soft-deleted meals inflated Home's totals
  // and count while Food showed the correct numbers. Filtering at this
  // shared boundary keeps every caller in agreement. `null` (the
  // post-restore value) counts as active.
  deletedAt?: unknown;
}

// Firestore payloads carry extra keys (items, confidence, createdAt, ...).
// The sum only reads the fields above; TypeScript's width-subtyping permits
// wider objects to be assigned to this type, and the useHomeData call site
// casts `d.data()` with `as MealTotalsInput` to make that explicit.
//
// No index signature on the interface itself — adding one broke
// compatibility with the typed `Meal` interface from useMeals, which has
// no index signature of its own. See commit message for the CI failure.

export interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  mealCount: number;
}

export const EMPTY_DAILY_TOTALS: DailyTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  mealCount: 0,
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sumMealTotals(
  meals: ReadonlyArray<MealTotalsInput>
): DailyTotals {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let sugar = 0;
  let sodium = 0;
  let mealCount = 0;

  for (const m of meals) {
    // HOME-MEALS-01: skip soft-deleted meals (deletedAt truthy) so they
    // count toward neither the totals nor the meal count. `null` (the
    // post-restore value) and absent are active.
    if (m.deletedAt) continue;
    calories += num(m.totalCalories ?? m.calories);
    protein += num(m.totalProtein ?? m.protein);
    carbs += num(m.totalCarbs ?? m.carbs);
    fat += num(m.totalFat ?? m.fat);
    fiber += num(m.totalFiber);
    sugar += num(m.totalSugar);
    sodium += num(m.totalSodium);
    mealCount += 1;
  }

  return {
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugar,
    sodium,
    mealCount,
  };
}

/**
 * The document a NEW serving should be written with when the user steps a
 * food's serving count up.
 *
 * The Edit-servings sheet saves up to four axes in one action: serving count,
 * meal slot, food name, and per-serving macros. Food.tsx applies the last
 * three by `editMeal`-ing every doc already in the group, then — if the count
 * also went up — duplicates the group's last doc to make up the difference.
 *
 * That duplicate was cloned from the PRE-EDIT in-memory snapshot
 * (`editingGroup.meals`, captured when the sheet opened and never refreshed),
 * so it carried none of the edit that had just been applied to its siblings:
 *
 *   2 servings at 200 kcal → set 300 kcal AND step to 4 servings
 *   → 300, 300, 200, 200   (the day is 200 kcal light, silently)
 *
 * The rename axis is worse than arithmetic: the new docs keep the OLD
 * foodName, so they group as a separate row from the ones they were meant to
 * join, and the user sees their food split in two.
 *
 * This is the pure derivation, extracted so it can be tested — the bug lived
 * for as long as it did because the apply path was an inline closure in a
 * 2000-line page component and only the SHEET had tests.
 */

/** The fields a meal doc carries that a duplicate must reproduce. */
export interface ServingSource {
  foodName: string;
  items?: unknown[];
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
  meal?: string;
}

export interface ServingMacroOverrides {
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
}

export interface ServingEditChanges {
  /** New meal slot, or null when the slot did not change. */
  targetMeal: string | null;
  /** New food name, or null when the name did not change. */
  targetName: string | null;
  /** Per-serving macro overrides, or null when no macro changed. */
  targetMacros: ServingMacroOverrides | null;
}

export interface DuplicatedServing {
  foodName: string;
  items: unknown[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  meal?: string;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Build the duplicate's document fields, with every axis of the SAME save
 * applied — so a new serving is indistinguishable from the siblings the edit
 * just rewrote.
 *
 * Macro overrides are per-serving totals (the sheet divides by the current
 * count before handing them over), which is exactly what one duplicated doc
 * should carry. An override is applied per dimension: changing only protein
 * must not reset calories to zero, so each field falls back to the source.
 */
export function duplicatedServingPayload(
  source: ServingSource,
  changes: ServingEditChanges
): DuplicatedServing {
  const macros = changes.targetMacros ?? {};
  const payload: DuplicatedServing = {
    foodName: changes.targetName ?? source.foodName,
    items: source.items ?? [],
    totalCalories: macros.totalCalories ?? num(source.totalCalories),
    totalProtein: macros.totalProtein ?? num(source.totalProtein),
    totalCarbs: macros.totalCarbs ?? num(source.totalCarbs),
    totalFat: macros.totalFat ?? num(source.totalFat),
  };
  const meal = changes.targetMeal ?? source.meal;
  if (meal) payload.meal = meal;
  return payload;
}

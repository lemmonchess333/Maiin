/**
 * Consistent number formatting for calories and macros across all screens.
 * Uses comma thousands separators. Whole numbers only.
 */

/** Format a calorie value: "2,933" */
export function formatCalories(value: number): string {
  return Math.round(value).toLocaleString();
}

/** Format a macro value in grams: "135" (no separator needed for typical values) */
export function formatMacro(value: number): string {
  return String(Math.round(value));
}

/** Standard calorie unit label — "kcal" everywhere */
export const CALORIE_UNIT = "kcal";

/**
 * Consistent number formatting for calories and macros across all screens.
 * Whole numbers only.
 *
 * The thousands separator follows the VIEWER's locale, not a fixed one.
 * That is deliberate and decided elsewhere: `dateTreatment.test.ts` bans
 * a locale-less `toLocaleDateString` precisely because date ORDER must
 * not follow the device, and in the same breath puts numeric grouping
 * out of scope because grouping should. So a UK reader gets "2,933" and
 * a German one "2.933", both correct for them.
 *
 * Stating a comma here as the contract is worse than saying nothing: a
 * comma is one locale's rendering of a value that has no fixed
 * rendering, and a reader who takes it literally will try to deliver it
 * — pinning 38 call sites to en-GB to satisfy a promise the app never
 * meant to make. Describe the rule, not one locale's output.
 */

/** Format a calorie value, grouped for the viewer's locale. */
export function formatCalories(value: number): string {
  return Math.round(value).toLocaleString();
}

/** Format a macro value in grams: "135" (no separator needed for typical values) */
export function formatMacro(value: number): string {
  return String(Math.round(value));
}

/** Standard calorie unit label — "kcal" everywhere */
export const CALORIE_UNIT = "kcal";

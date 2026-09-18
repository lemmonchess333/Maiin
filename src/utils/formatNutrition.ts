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

/**
 * The calorie unit label, in one place.
 *
 * "kcal everywhere" is what this said before there was anything holding
 * it, and the app shipped both words: 34 surfaces wrote the unit as a
 * literal, roughly half "cal" and half "kcal", and the split did not
 * follow any boundary a reader could learn. Home's energy card said
 * "1,790 kcal logged" while the day-detail card one tap away said
 * "1,790 cal"; the food suggestion dropdown used both, three list
 * sections apart.
 *
 * `calorieUnitGate.test.ts` now refuses a hardcoded calorie unit beside a
 * value, so in production code the word lives here alone. Changing it is
 * this line — worth knowing if "cal" (shorter, and what the US food apps
 * show) is ever preferred to "kcal" (the correct unit, and the UK/EU
 * convention this app is written in). Measured: flipping it turns ~16
 * tests red, all of them asserting a whole rendered sentence that happens
 * to contain the unit. Those are working as intended and are not part of
 * the sweep; the pin on the word itself lives in this file's own test.
 */
export const CALORIE_UNIT = "kcal";

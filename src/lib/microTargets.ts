/**
 * Reference targets for the "other" nutrients surfaced in the Nutrition
 * breakdown — fiber, sugar, sodium. These are NOT the same KIND:
 *
 *   - fiber  → a GOAL: aim to reach it (more is good). IOM adequate intake
 *              is ~38 g/day (men) / ~25 g/day (women); 30 g is a sensible
 *              default when sex is unknown.
 *   - sodium → a LIMIT: stay under it. FDA/AHA upper limit is 2300 mg/day.
 *   - sugar  → a soft LIMIT scaled to calories (see resolveMicroTargets):
 *              total-sugar data has no health cap, so it's a proportional
 *              15%-of-calories allowance (the MyFitnessPal standard), not a
 *              fixed added-sugar cap.
 *
 * The `kind` drives the UI: a goal fills toward 100% (good), a limit flags
 * a warning register once exceeded (over is the caution state, not the win).
 */
export type MicroKind = "goal" | "limit";

export interface MicroTarget {
  key: "fiber" | "sugar" | "sodium";
  label: string;
  target: number;
  unit: "g" | "mg";
  kind: MicroKind;
}

// Sugar is 15% of the calorie target (4 kcal/g). Health guidance caps
// ADDED/free sugar (WHO <10% cal, AHA 25–36 g), but Gemini/barcode give us
// TOTAL sugar — and there is NO health limit for total sugar (fruit/dairy
// sugars aren't meant to be capped). So a fixed added-sugar cap would
// unfairly flag fruit eaters; the honest approach for total-sugar data is a
// proportional allowance, and 15%-of-calories is the established standard
// (MyFitnessPal's default). It scales with intake, sits between WHO's 10%
// (too strict for total) and Cal AI's lenient ~18%, and stays a soft "guide"
// (amber when over), not a health verdict. Falls back to a 2000-cal
// reference (~75 g) when no calorie target is known.
const SUGAR_CALORIE_FRACTION = 0.15;
const SUGAR_FALLBACK_CALORIES = 2000;

export function resolveMicroTargets(
  sex?: "male" | "female",
  calorieTarget?: number
): MicroTarget[] {
  const fiberGoal = sex === "male" ? 38 : sex === "female" ? 25 : 30;
  const cals =
    typeof calorieTarget === "number" && calorieTarget > 0
      ? calorieTarget
      : SUGAR_FALLBACK_CALORIES;
  const sugarGuide = Math.round((SUGAR_CALORIE_FRACTION * cals) / 4);
  return [
    {
      key: "fiber",
      label: "Fiber",
      target: fiberGoal,
      unit: "g",
      kind: "goal",
    },
    {
      key: "sugar",
      label: "Sugar",
      target: sugarGuide,
      unit: "g",
      kind: "limit",
    },
    { key: "sodium", label: "Sodium", target: 2300, unit: "mg", kind: "limit" },
  ];
}

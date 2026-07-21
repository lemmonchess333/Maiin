/**
 * Reference targets for the "other" nutrients surfaced in the Nutrition
 * breakdown — fiber, sugar, sodium. These are NOT personalised the way
 * calorie/macro targets are (there's no engine for them); they're standard
 * dietary reference values, and crucially they are NOT all the same KIND:
 *
 *   - fiber  → a GOAL: aim to reach it (more is good). IOM adequate intake
 *              is ~38 g/day (men) / ~25 g/day (women); 30 g is a sensible
 *              default when sex is unknown.
 *   - sodium → a LIMIT: stay under it. FDA/AHA upper limit is 2300 mg/day.
 *   - sugar  → a LIMIT: keep an eye on it. Logged `sugar` is TOTAL sugars
 *              (natural + added), so an added-sugar cap (25–36 g) would flag
 *              anyone eating fruit; we use the FDA Daily Value of 50 g as a
 *              neutral reference rather than a hard health cap.
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

export function resolveMicroTargets(sex?: "male" | "female"): MicroTarget[] {
  const fiberGoal = sex === "male" ? 38 : sex === "female" ? 25 : 30;
  return [
    {
      key: "fiber",
      label: "Fiber",
      target: fiberGoal,
      unit: "g",
      kind: "goal",
    },
    { key: "sugar", label: "Sugar", target: 50, unit: "g", kind: "limit" },
    { key: "sodium", label: "Sodium", target: 2300, unit: "mg", kind: "limit" },
  ];
}

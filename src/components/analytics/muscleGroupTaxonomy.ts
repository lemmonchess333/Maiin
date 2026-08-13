/**
 * The two vocabularies that reach the muscle heat map, and the tables that
 * reconcile them.
 *
 * `WorkoutExercise.category` on a saved workout carries a **MovementCategory**
 * — `hip_dominant`, `horizontal_push`, `core`. `useProgram.onCompleteDay` is
 * the only writer of that field in production and it stores
 * `ex.movementCategory` verbatim. The catalogue's own coarser vocabulary
 * ("Chest" / "Back" / "Legs" / "Cardio", `EXERCISE_CATEGORIES`) never lands
 * in a workout document at all; History reaches it by looking the exercise up
 * in `EXERCISES` by name, which it prefers precisely BECAUSE the saved field
 * speaks the other vocabulary.
 *
 * So both taxonomies arrive here, by different routes, and both are current:
 *
 *   catalogue lookup succeeds → "Chest", "Legs", …    (History's primary)
 *   catalogue lookup fails    → "hip_dominant", …      (custom exercises)
 *
 * WHY THIS MODULE EXISTS. These tables previously sat private inside
 * `MuscleHeatMap.tsx` under comments calling the movement keys "legacy",
 * "older", and translations "of old workout docs" — the exact inverse of
 * which one production writes. That misdescription is a live deletion
 * hazard: pruning the "legacy aliases" would silently drop every custom
 * exercise out of the heat map and off the recovery legend, with nothing
 * failing. Extracted so the reconciliation can be pinned by a test instead
 * of asserted by prose — the sibling-module shape `muscleShare.ts` already
 * uses on this component.
 */

import type { IExerciseData } from "react-body-highlighter";

/** Translate technical movementCategory keys to user-friendly group names. */
export const CATEGORY_DISPLAY: Record<string, string> = {
  knee_dominant: "Quads & Glutes",
  hip_dominant: "Hamstrings & Back",
  horizontal_push: "Chest",
  vertical_push: "Shoulders",
  horizontal_pull: "Back",
  vertical_pull: "Lats",
  arms_biceps: "Biceps",
  arms_triceps: "Triceps",
  core: "Core",
};

/**
 * Friendly group name → react-body-highlighter muscle ids.
 *
 * Keyed on BOTH live vocabularies: the catalogue groups History resolves by
 * name, and the `CATEGORY_DISPLAY` outputs a custom exercise falls back to.
 * Every value of `CATEGORY_DISPLAY` must appear here — pinned by
 * `muscleGroupTaxonomy.test.ts`.
 */
export const MUSCLE_MAP: Record<string, IExerciseData["muscles"]> = {
  // Catalogue groups (EXERCISE_CATEGORIES), reached via History's
  // exercise-name lookup.
  Chest: ["chest"],
  Back: ["upper-back", "lower-back"],
  Shoulders: ["front-deltoids", "back-deltoids"],
  Biceps: ["biceps"],
  Triceps: ["triceps"],
  Legs: ["quadriceps", "gluteal", "hamstring", "calves"],
  Core: ["abs", "obliques"],
  "Full Body": ["chest", "upper-back", "quadriceps", "abs"],
  Cardio: [],
  // CATEGORY_DISPLAY outputs — the movement-key route, for exercises the
  // catalogue lookup misses. NOT legacy: this is what the saved field says.
  "Quads & Glutes": ["quadriceps", "gluteal"],
  "Hamstrings & Back": ["hamstring", "upper-back", "lower-back"],
  Lats: ["upper-back"],
  Calves: ["calves"],
  Traps: ["trapezius"],
};

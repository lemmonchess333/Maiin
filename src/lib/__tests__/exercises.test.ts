/**
 * Tests for the lookup + utility functions in `exercises.ts`.
 *
 * Five exports here, but only the four functions are tested —
 * `EXERCISES` and `EXERCISE_CATEGORIES` are data tables whose
 * coverage is enforced by `exerciseIdIntegrity.test.ts` already.
 *
 * Key contract pinned: `isBodyweightExerciseId` checks
 * `equipment === "Bodyweight"`, NOT `weight === 0`. Pre-fix the
 * codebase used `weight === 0` as the bodyweight signal, which
 * silently labelled an uncalibrated weighted exercise (e.g. a
 * fresh Lat Pulldown that nobody has set a starting weight on
 * yet) as BW and dragged 1RM charts to 0. See the docstring on
 * the function itself for the full history.
 */
import { describe, it, expect } from "vitest";
import {
  getExercisesByCategory,
  getExerciseById,
  isBodyweightExerciseId,
  estimateCalories,
} from "../exercises";

describe("getExercisesByCategory", () => {
  it("returns all exercises in a known category", () => {
    const chest = getExercisesByCategory("Chest");
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((e) => e.category === "Chest")).toBe(true);
  });

  it("returns [] for an unknown category", () => {
    expect(getExercisesByCategory("NotARealCategory")).toEqual([]);
  });

  it("is case-sensitive (categories are PascalCase)", () => {
    expect(getExercisesByCategory("chest")).toEqual([]);
    expect(getExercisesByCategory("Chest").length).toBeGreaterThan(0);
  });
});

describe("getExerciseById", () => {
  it("returns an exercise for a known id", () => {
    const bench = getExerciseById("bench-press");
    expect(bench).toBeDefined();
    expect(bench?.name).toBe("Bench Press");
  });

  it("returns undefined for an unknown id", () => {
    expect(getExerciseById("not-a-real-id")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getExerciseById("")).toBeUndefined();
  });
});

describe("isBodyweightExerciseId", () => {
  it("returns true for an intrinsically bodyweight exercise", () => {
    expect(isBodyweightExerciseId("push-ups")).toBe(true);
    expect(isBodyweightExerciseId("pull-ups")).toBe(true);
  });

  it("returns false for a weighted exercise (Barbell)", () => {
    /* The historical bug: bench-press with weight=0 (uncalibrated)
       used to be flagged as BW. Pin the equipment-based contract. */
    expect(isBodyweightExerciseId("bench-press")).toBe(false);
    expect(isBodyweightExerciseId("squat")).toBe(false);
  });

  it("returns false for a Machine exercise", () => {
    expect(isBodyweightExerciseId("lat-pulldown")).toBe(false);
  });

  it("returns false for undefined input", () => {
    expect(isBodyweightExerciseId(undefined)).toBe(false);
  });

  it("returns false for an unknown id", () => {
    expect(isBodyweightExerciseId("not-a-real-id")).toBe(false);
  });
});

describe("estimateCalories", () => {
  it("returns 0 for an unknown exerciseId", () => {
    /* Defensive: caller might pass a stale id; we'd rather show 0
       than throw or guess. */
    expect(estimateCalories("not-a-real-id", 3, 10, 60)).toBe(0);
  });

  it("returns a positive estimate for a known weighted exercise", () => {
    /* The formula multiplies caloriesPerMinute × minutes ×
       weightMultiplier (1 + weightKg/100 × 0.3). We don't pin the
       exact value (table tweaks would force test updates) — just
       that the estimate is positive and scales sensibly with the
       inputs. */
    const result = estimateCalories("bench-press", 3, 10, 60);
    expect(result).toBeGreaterThan(0);
  });

  it("scales up with more sets", () => {
    const fewer = estimateCalories("bench-press", 2, 10, 60);
    const more = estimateCalories("bench-press", 5, 10, 60);
    expect(more).toBeGreaterThan(fewer);
  });

  it("scales up with more reps", () => {
    const fewer = estimateCalories("bench-press", 3, 5, 60);
    const more = estimateCalories("bench-press", 3, 15, 60);
    expect(more).toBeGreaterThan(fewer);
  });

  it("scales up with heavier weight (via weightMultiplier)", () => {
    const lighter = estimateCalories("bench-press", 3, 10, 40);
    const heavier = estimateCalories("bench-press", 3, 10, 120);
    expect(heavier).toBeGreaterThan(lighter);
  });

  it("returns a rounded integer (Math.round)", () => {
    const result = estimateCalories("bench-press", 3, 10, 60);
    expect(Number.isInteger(result)).toBe(true);
  });
});

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
  EXERCISES,
  getExercisesByCategory,
  getExerciseById,
  isBodyweightExerciseId,
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

// ── Richer form-guide / programming data (D-LIFT-19) ──

describe("extended exercise fields (D-LIFT-19)", () => {
  it("bench-press carries the backfilled coaching data", () => {
    const bench = getExerciseById("bench-press")!;
    expect(bench.difficulty).toBe("intermediate");
    expect(bench.tempo).toMatch(/^\d+-\d+-\d+$/);
    expect(bench.commonMistakes?.length).toBeGreaterThan(0);
    expect(bench.alternatives?.length).toBeGreaterThan(0);
  });

  it("any backfilled `alternatives` / `regressions` point at real exercise ids", () => {
    for (const ex of EXERCISES) {
      for (const id of [
        ...(ex.alternatives ?? []),
        ...(ex.regressions ?? []),
      ]) {
        expect(
          getExerciseById(id),
          `${ex.id} references missing exercise "${id}"`
        ).toBeDefined();
      }
    }
  });

  it("`difficulty` is one of the allowed levels where present", () => {
    const allowed = new Set(["beginner", "intermediate", "advanced"]);
    for (const ex of EXERCISES) {
      if (ex.difficulty) expect(allowed.has(ex.difficulty)).toBe(true);
    }
  });
});

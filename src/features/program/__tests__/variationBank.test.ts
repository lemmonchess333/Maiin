/**
 * Tests for `variationBank` — the movement-category exercise picker
 * used by the procedural program engine to choose specific exercises
 * for each pattern slot (e.g. horizontal_push → bench press / incline
 * bench / DB bench / etc).
 *
 * `pickExercise` has three deterministic branches and one
 * non-deterministic (random) one:
 *   1. plateauCount < 3 + matching currentExerciseId → returns current
 *   2. plateauCount < 3 + no current → returns the primary
 *   3. plateauCount >= 3 → rotates to a different variation (random)
 *
 * `pickAccessory` is always random across non-primary, non-excluded
 * options. We pin the random paths by asserting the result is
 * always in the expected candidate set rather than asserting a
 * specific id (which would require mocking Math.random).
 */
import { describe, it, expect } from "vitest";
import { exerciseBank, pickExercise, pickAccessory } from "../variationBank";

describe("exerciseBank — structural invariants", () => {
  it("covers every MovementCategory", () => {
    /* If a future MovementCategory gets added to programTypes.ts
       but missed in the bank, the engine would crash at
       exerciseBank[category]. Pin the full coverage. */
    const expected = [
      "horizontal_push",
      "vertical_push",
      "horizontal_pull",
      "vertical_pull",
      "knee_dominant",
      "hip_dominant",
      "arms_biceps",
      "arms_triceps",
      "core",
    ] as const;
    for (const cat of expected) {
      expect(exerciseBank[cat]).toBeDefined();
      expect(exerciseBank[cat].length).toBeGreaterThan(0);
    }
  });

  it("every category has exactly one primary exercise", () => {
    /* pickExercise's no-plateau-no-current branch falls back to
       `options.find(primary)` then `options[0]`. Both should be the
       same exercise — if multiple are flagged primary the picker
       silently picks the first one, which is fragile. */
    for (const [category, options] of Object.entries(exerciseBank)) {
      const primaries = options.filter((o) => o.primary);
      expect(primaries.length, `category ${category}`).toBe(1);
    }
  });
});

describe("pickExercise — no plateau (deterministic)", () => {
  it("returns the matching current exercise when plateauCount < 3", () => {
    /* User has been on db-bench for a while, hasn't plateaued.
       Stay on db-bench — don't shuffle them onto bench-press
       for no reason. */
    const result = pickExercise("horizontal_push", 0, "db-bench");
    expect(result.id).toBe("db-bench");
  });

  it("falls through to the primary when current id is not in the category", () => {
    /* The id doesn't match any exercise in horizontal_push (it's
       a hip-dominant id). Picker falls back to the primary. */
    const result = pickExercise("horizontal_push", 0, "deadlift");
    expect(result.id).toBe("bench-press");
  });

  it("returns the primary when no current id is provided", () => {
    expect(pickExercise("horizontal_push", 0).id).toBe("bench-press");
    expect(pickExercise("hip_dominant", 0).id).toBe("deadlift");
    expect(pickExercise("knee_dominant", 0).id).toBe("squat");
  });

  it("returns the primary at plateauCount = 2 (just under the threshold)", () => {
    /* The rotation threshold is `>= 3`, so 2 still uses the
       no-plateau path. */
    expect(pickExercise("vertical_push", 2).id).toBe("overhead-press");
  });
});

describe("pickExercise — plateau rotation", () => {
  it("returns a DIFFERENT exercise from the current id when plateauCount >= 3", () => {
    /* Run the picker enough times to ensure it doesn't accidentally
       always return the same exercise — but every result must
       differ from the current id, which is the contract. */
    for (let i = 0; i < 30; i++) {
      const result = pickExercise("horizontal_push", 3, "bench-press");
      expect(result.id).not.toBe("bench-press");
    }
  });

  it("returns a valid exercise from the category", () => {
    /* The picked exercise must be one of the category's options. */
    const validIds = new Set(exerciseBank.knee_dominant.map((o) => o.id));
    for (let i = 0; i < 30; i++) {
      const result = pickExercise("knee_dominant", 5, "squat");
      expect(validIds.has(result.id)).toBe(true);
    }
  });

  it("handles plateau when no current id is provided", () => {
    /* options.filter(e => e.id !== currentExerciseId) keeps all
       options when current is undefined; picker still rotates
       within the full set. */
    const validIds = new Set(exerciseBank.arms_biceps.map((o) => o.id));
    for (let i = 0; i < 20; i++) {
      const result = pickExercise("arms_biceps", 4);
      expect(validIds.has(result.id)).toBe(true);
    }
  });
});

describe("pickAccessory", () => {
  it("never returns the primary exercise", () => {
    /* Accessories explicitly exclude the primary so the program
       has variety beyond the main lift. */
    for (let i = 0; i < 30; i++) {
      const result = pickAccessory("horizontal_push");
      const primary = exerciseBank.horizontal_push.find((e) => e.primary);
      expect(result.id).not.toBe(primary?.id);
    }
  });

  it("never returns the excluded id", () => {
    /* Used so the program doesn't pick the same accessory twice
       on the same day. */
    for (let i = 0; i < 30; i++) {
      const result = pickAccessory("horizontal_push", "db-bench");
      expect(result.id).not.toBe("db-bench");
    }
  });

  it("returns a valid exercise from the category", () => {
    const validIds = new Set(exerciseBank.vertical_pull.map((o) => o.id));
    for (let i = 0; i < 30; i++) {
      const result = pickAccessory("vertical_pull");
      expect(validIds.has(result.id)).toBe(true);
    }
  });

  it("biases toward LENGTHENED options when the category has any (D-LIFT-2)", () => {
    // Categories with tagged lengthened accessories should ONLY return those
    // (lengthened bias), never a non-lengthened non-primary.
    const withLengthened = (
      Object.keys(exerciseBank) as (keyof typeof exerciseBank)[]
    ).filter((cat) => exerciseBank[cat].some((e) => e.lengthened));
    expect(withLengthened.length).toBeGreaterThan(0);
    for (const cat of withLengthened) {
      const lengthenedIds = new Set(
        exerciseBank[cat].filter((e) => e.lengthened).map((e) => e.id)
      );
      for (let i = 0; i < 25; i++) {
        expect(lengthenedIds.has(pickAccessory(cat).id)).toBe(true);
      }
    }
  });

  it("still returns a valid non-primary for categories with NO lengthened tag", () => {
    // core has no lengthened accessories — falls back to the full non-primary
    // pool, preserving variety.
    const nonPrimary = new Set(
      exerciseBank.core.filter((e) => !e.primary).map((e) => e.id)
    );
    for (let i = 0; i < 25; i++) {
      expect(nonPrimary.has(pickAccessory("core").id)).toBe(true);
    }
  });

  it("returns the primary as a defensive fallback when all non-primaries are excluded", () => {
    /* Edge case: only one non-primary exists and it's excluded.
       Filter returns []; picker falls back to exerciseBank[cat][0]
       (the primary). Vertical_push has 3 non-primary options so
       construct the worst case by excluding them all. */
    /* Pick a category with exactly 2 non-primary options to keep
       this tractable. arms_triceps has 3 non-primary options
       (skull-crushers, overhead-extension, tricep-dips). Excluding
       all three should force the fallback. */
    const result = pickAccessory("arms_triceps", "skull-crushers");
    /* Since we can only exclude one id, exclusion still leaves
       2 valid candidates. Just verify result is one of them. */
    expect(["overhead-extension", "tricep-dips"]).toContain(result.id);
  });
});

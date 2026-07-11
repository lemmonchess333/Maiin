/**
 * ROUTINE-EXCHANGE-01 — curated library pins.
 *
 *   - library size is in the locked 8–12 range
 *   - EVERY exerciseId resolves against the exercise database
 *   - every blueprint passes the validation guard
 *   - weight redaction: no blueprint carries any weight, and the
 *     SavedRoutine conversion blanks targetWeightKg (0) — the
 *     recipient's history drives loads
 *   - conversion is a private copy with immutable Tropos attribution
 */
import { describe, it, expect } from "vitest";
import {
  CURATED_BLUEPRINTS,
  blueprintToRoutineInput,
  validateBlueprint,
} from "../routineBlueprints";

describe("curated library", () => {
  it("ships 8–12 blueprints (locked launch range)", () => {
    expect(CURATED_BLUEPRINTS.length).toBeGreaterThanOrEqual(8);
    expect(CURATED_BLUEPRINTS.length).toBeLessThanOrEqual(12);
  });

  it("every blueprint validates — all exercise ids resolve, bounds hold", () => {
    for (const b of CURATED_BLUEPRINTS) {
      expect(validateBlueprint(b), b.id).toEqual([]);
    }
  });

  it("ids are unique", () => {
    const ids = CURATED_BLUEPRINTS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries no personal weights anywhere", () => {
    expect(JSON.stringify(CURATED_BLUEPRINTS)).not.toMatch(
      /weightKg|targetWeight/
    );
  });
});

describe("validateBlueprint", () => {
  it("flags unknown exercises and out-of-bound prescriptions", () => {
    const bad = {
      ...CURATED_BLUEPRINTS[0],
      exercises: [
        {
          exerciseId: "cursed-machine",
          name: "Cursed Machine",
          sets: 99,
          reps: 0,
        },
      ],
    };
    const problems = validateBlueprint(bad);
    expect(problems.join(" ")).toMatch(/unknown exercise/);
    expect(problems.join(" ")).toMatch(/sets bound/);
    expect(problems.join(" ")).toMatch(/reps bound/);
  });
});

describe("blueprintToRoutineInput", () => {
  const input = blueprintToRoutineInput(CURATED_BLUEPRINTS[0]);

  it("blanks every personal weight (0) — history drives loads", () => {
    for (const ex of input.exercises) {
      expect(ex.targetWeightKg).toBe(0);
    }
  });

  it("keeps order + prescription and pins Tropos attribution", () => {
    expect(input.exercises.map((e) => e.exerciseId)).toEqual(
      CURATED_BLUEPRINTS[0].exercises.map((e) => e.exerciseId)
    );
    expect(input.exercises[0].setCount).toBe(
      CURATED_BLUEPRINTS[0].exercises[0].sets
    );
    expect(input.sourceAuthorId).toBe("tropos");
    expect(input.sourceActivityId).toBe(
      `blueprint:${CURATED_BLUEPRINTS[0].id}`
    );
  });
});

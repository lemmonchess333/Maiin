/**
 * Pgm5 injury follow-up — applyInjuryFiltersToWorkouts.
 *
 * In-place injury-aware re-swap for an existing programme's WorkoutDays.
 * Pins: swaps a contraindicated exercise (carrying history, RESCALING the
 * load — a 140 kg squat does not transfer to 140 kg of its knee-safe
 * substitute), does NOT
 * over-swap (a knee exercise is left alone for a shoulder-only user), no-ops
 * for healthy / "none", and preserves day + exercise counts (structure).
 *
 * Fixture: "squat" (Barbell Squat) is tagged contra:["knee"] in the template
 * library AND has entries in INJURY_SUBSTITUTIONS, so a knee user gets a real
 * swap while a shoulder user does not.
 */
import { rescaleForSwap } from "@/features/program/variationBank";
import { describe, it, expect } from "vitest";
import { applyInjuryFiltersToWorkouts } from "../matchTemplate";
import type { WorkoutDay, ProgramExercise } from "../programTypes";

function ex(
  exerciseId: string,
  name: string,
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name,
    exerciseId,
    movementCategory: "knee_dominant",
    sets: 4,
    reps: 8,
    baseReps: 8,
    weight: 100,
    progressionType: "linear",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

const day = (exercises: ProgramExercise[]): WorkoutDay => ({
  dayName: "Lower",
  dayType: "lower",
  completed: false,
  exercises,
});

describe("applyInjuryFiltersToWorkouts", () => {
  it("swaps a knee-contraindicated exercise, carrying history and RESCALING the load", () => {
    const w = [
      day([
        ex("squat", "Barbell Squat", { weight: 140, sets: 5 }),
        ex("bench-press", "Bench Press", {
          movementCategory: "horizontal_push",
        }),
      ]),
    ];
    const out = applyInjuryFiltersToWorkouts(w, ["knee"]);
    const swapped = out[0].exercises[0];
    expect(swapped.exerciseId).not.toBe("squat"); // a real swap happened
    // CORRECTED 2026-07-28: this asserted `toBe(140)` — "weight carried". A
    // 140 kg back squat does not transfer to 140 kg of whatever spares the
    // knee; carrying it verbatim is the dangerous direction. Rescaled by the
    // load-factor ratio instead. History and sets still carry verbatim, which
    // is what this test was really protecting.
    expect(swapped.weight).toBe(
      rescaleForSwap(140, "squat", swapped.exerciseId, "knee_dominant")
    );
    expect(swapped.weight).toBeLessThan(140);
    expect(swapped.sets).toBe(5); // sets carried
    expect(swapped.notes).toMatch(/Swapped from Barbell Squat/i);
    // The non-contraindicated exercise is untouched.
    expect(out[0].exercises[1].exerciseId).toBe("bench-press");
  });

  it("does NOT over-swap: a knee exercise is kept for a shoulder-only user", () => {
    const out = applyInjuryFiltersToWorkouts(
      [day([ex("squat", "Barbell Squat")])],
      ["shoulder"]
    );
    expect(out[0].exercises[0].exerciseId).toBe("squat");
  });

  it("is a no-op for healthy users and 'none'", () => {
    const w = [day([ex("squat", "Barbell Squat")])];
    expect(applyInjuryFiltersToWorkouts(w, [])[0].exercises[0].exerciseId).toBe(
      "squat"
    );
    expect(
      applyInjuryFiltersToWorkouts(w, ["none"])[0].exercises[0].exerciseId
    ).toBe("squat");
  });

  it("preserves day + exercise counts (structure)", () => {
    const w = [day([ex("squat", "Barbell Squat"), ex("bench-press", "Bench")])];
    const out = applyInjuryFiltersToWorkouts(w, ["knee"]);
    expect(out).toHaveLength(1);
    expect(out[0].exercises).toHaveLength(2);
  });

  it("is idempotent — re-running with the same injuries doesn't keep changing ids", () => {
    const w = [day([ex("squat", "Barbell Squat")])];
    const once = applyInjuryFiltersToWorkouts(w, ["knee"]);
    const twice = applyInjuryFiltersToWorkouts(once, ["knee"]);
    expect(twice[0].exercises[0].exerciseId).toBe(
      once[0].exercises[0].exerciseId
    );
  });
});

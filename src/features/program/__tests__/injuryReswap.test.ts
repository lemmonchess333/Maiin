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

describe("applyInjuryFiltersToWorkouts — no lift a third day in the week", () => {
  /** A week of one-lift days. */
  const week = (...lifts: ProgramExercise[]): WorkoutDay[] =>
    lifts.map((lift, i) => ({ ...day([lift]), dayName: `Day ${i + 1}` }));
  const liftsOf = (workouts: WorkoutDay[]) =>
    workouts.flatMap((d) => d.exercises.map((e) => e.exerciseId));
  const press = (exerciseId: string, name: string, isAccessory = false) =>
    ex(exerciseId, name, { movementCategory: "horizontal_push", isAccessory });

  it("two swaps don't land on a lift the week can take once more", () => {
    // A sore knee: both squats become Bulgarian split squats, so the leg
    // press takes the next lift that spares the knee, the hip thrust.
    const out = applyInjuryFiltersToWorkouts(
      week(
        ex("squat", "Barbell Squat"),
        ex("squat", "Barbell Squat", { isAccessory: true }),
        ex("leg-press", "Leg Press", { isAccessory: true })
      ),
      ["knee"]
    );
    expect(liftsOf(out)).toEqual([
      "bulgarian-split",
      "bulgarian-split",
      "hip-thrust",
    ]);
  });

  it("ranks the person's kit above the cap", () => {
    // A sore shoulder at home: the incline dumbbell press is the one
    // press both safe for the shoulder and in a home gym, so the third
    // bench press takes it again rather than the barbell floor press.
    // (The overhead press takes it while the week has room; push-ups,
    // further down its list, would have left room for the bench press.)
    const out = applyInjuryFiltersToWorkouts(
      week(
        press("bench-press", "Bench Press"),
        ex("overhead-press", "Overhead Press", {
          movementCategory: "vertical_push",
        }),
        press("bench-press", "Bench Press", true)
      ),
      ["shoulder"],
      "home_gym"
    );
    expect(liftsOf(out)).toEqual([
      "incline-db-press",
      "incline-db-press",
      "incline-db-press",
    ]);
  });
});

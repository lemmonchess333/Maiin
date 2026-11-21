/**
 * A new plan's lifts started from the person's last sessions (TrainWk1
 * step 6): Stop lifting then Add lifting starts a squat last lifted at
 * 130 kg from there, not from a first guess.
 */
import { describe, it, expect } from "vitest";
import { withLastLoads } from "../carriedLoads";
import { scaleLoadForReps } from "../represcribe";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

function lift(
  exerciseId: string,
  reps: number,
  extra: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name: exerciseId,
    exerciseId,
    movementCategory: "knee_dominant",
    sets: 3,
    reps,
    baseReps: reps,
    weight: 90,
    progressionType: "linear",
    lastSuccessfulWeight: 90,
    lastAttemptedWeight: 90,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    ...extra,
  } as ProgramExercise;
}

const day = (...exercises: ProgramExercise[]) => [
  { dayName: "Full Body A", exercises } as unknown as WorkoutDay,
];

describe("withLastLoads", () => {
  it("starts a lift from the weight its last session followed, at the plan's reps", () => {
    const last = new Map([
      [
        "squat",
        [
          { weightKg: 130, reps: 5 },
          { weightKg: 130, reps: 5 },
          { weightKg: 130, reps: 4 },
          { weightKg: 110, reps: 8 },
        ],
      ],
    ]);
    const [squat] = withLastLoads(day(lift("squat", 8)), last)[0].exercises;
    // 130 for 4 (the fewest at it), moved to 8 reps: less, on the plates.
    expect(squat.weight).toBe(scaleLoadForReps(130, 4, 8));
    expect(squat.weight).toBe(117.5);
    expect(squat.lastSuccessfulWeight).toBe(117.5);
    expect(squat.lastAttemptedWeight).toBe(117.5);
  });

  it("keeps the weight for fewer reps than last time, and never adds any", () => {
    const last = new Map([["squat", [{ weightKg: 100, reps: 10 }]]]);
    const [squat] = withLastLoads(day(lift("squat", 5)), last)[0].exercises;
    expect(squat.weight).toBe(100);
  });

  it("leaves a lift not done before, a bodyweight lift and a timed one as the plan has them", () => {
    const plan = day(
      lift("romanian-deadlift", 8),
      lift("pull-ups", 8, { weight: 0, movementCategory: "vertical_pull" }),
      lift("plank", 30, { weight: 0, repUnit: "seconds" })
    );
    const last = new Map([
      ["pull-ups", [{ weightKg: 10, reps: 6 }]],
      ["plank", [{ weightKg: 0, reps: 45 }]],
    ]);
    expect(withLastLoads(plan, last)).toEqual(plan);
  });

  it("rounds to the lifter's own plates", () => {
    const last = new Map([["squat", [{ weightKg: 100, reps: 5 }]]]);
    const [squat] = withLastLoads(day(lift("squat", 10)), last, "lbs")[0]
      .exercises;
    expect(squat.weight).toBe(scaleLoadForReps(100, 5, 10, "lbs"));
  });
});

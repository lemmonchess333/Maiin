/**
 * A leg miss within a day after a long or hard run counts half (Lift4 (7)),
 * from the record each saved session keeps of a hard run in the 24 hours
 * before it (Lift4 (14)): the run explains some of the miss, so it takes
 * two such misses to count as one.
 */
import { describe, it, expect } from "vitest";
import { applySessionProgression } from "../sessionCompletion";
import { normalizeProgramState, type ProgramState } from "../programTypes";

const plan = (): ProgramState =>
  normalizeProgramState({
    weekNumber: 2,
    goal: "recomp",
    currentPhase: "progression",
    splitType: "full_body",
    workouts: [
      {
        dayName: "Full body",
        dayType: "full_body",
        completed: false,
        exercises: [
          {
            instanceId: "squat-1",
            exerciseId: "squat",
            name: "Squat",
            movementCategory: "knee_dominant",
            sets: 3,
            reps: 5,
            weight: 100,
            progressionType: "linear",
          },
          {
            instanceId: "bench-1",
            exerciseId: "bench-press",
            name: "Bench Press",
            movementCategory: "horizontal_push",
            sets: 3,
            reps: 5,
            weight: 80,
            progressionType: "linear",
          },
        ],
      },
    ],
    settings: { autoProgression: true, smallPlates: false },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
  } as unknown as ProgramState);

/** A session at the plan's weights with every set a rep short. */
function missed(state: ProgramState, afterHardRun: boolean) {
  const lifts = state.workouts[0].exercises;
  return applySessionProgression(state, 0, {
    completionId: `session-${Math.random()}`,
    date: "2026-09-10",
    prescription: { exercises: lifts, progressionBaseline: lifts },
    setLogs: lifts.map((lift) =>
      Array.from({ length: 3 }, () => ({
        weight: lift.weight,
        reps: lift.reps - 1,
        completed: true,
      }))
    ),
    ...(afterHardRun ? { afterHardRun: true } : {}),
  });
}

const lift = (state: ProgramState, id: string) =>
  state.workouts[0].exercises.find((ex) => ex.instanceId === id)!;

describe("a miss within a day after a long or hard run", () => {
  it("counts half for a leg lift and in full for the rest", () => {
    const after = missed(plan(), true);
    expect(lift(after, "squat-1").consecutiveFailures).toBe(0.5);
    expect(lift(after, "bench-1").consecutiveFailures).toBe(1);
  });

  it("takes two such misses to count as one, so the legs hold their weight", () => {
    const twice = missed(missed(plan(), true), true);
    expect(lift(twice, "squat-1").consecutiveFailures).toBe(1);
    expect(lift(twice, "squat-1").weight).toBe(100);
    // The bench missed twice in a row in full, and comes down.
    expect(lift(twice, "bench-1").weight).toBeLessThan(80);
  });

  it("counts in full without a hard run", () => {
    const twice = missed(missed(plan(), false), false);
    expect(lift(twice, "squat-1").weight).toBeLessThan(100);
  });
});

import { describe, it, expect } from "vitest";
import {
  startingWeightForCategory,
  seedStartingLoads,
  type StartingLoadContext,
} from "../startingLoads";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

const ctx = (over: Partial<StartingLoadContext> = {}): StartingLoadContext => ({
  bodyweightKg: 80,
  experience: "beginner",
  ...over,
});

function ex(over: Partial<ProgramExercise>): ProgramExercise {
  return {
    name: "X",
    exerciseId: "x",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: false,
    ...over,
  };
}

const day = (exercises: ProgramExercise[]): WorkoutDay => ({
  dayName: "D",
  dayType: "full_body",
  completed: false,
  exercises,
});

describe("startingWeightForCategory", () => {
  it("scales with bodyweight × experience, rounded to 2.5kg", () => {
    // 80kg beginner bench: 80 × 0.45 = 36 → 35
    expect(startingWeightForCategory("horizontal_push", ctx())).toBe(35);
    // intermediate: 80 × 0.7 = 56 → 55
    expect(
      startingWeightForCategory(
        "horizontal_push",
        ctx({ experience: "intermediate" })
      )
    ).toBe(55);
    // beginner squat: 80 × 0.7 = 56 → 55
    expect(startingWeightForCategory("knee_dominant", ctx())).toBe(55);
  });

  it("returns 0 for bodyweight patterns", () => {
    expect(startingWeightForCategory("vertical_pull", ctx())).toBe(0);
    expect(startingWeightForCategory("core", ctx())).toBe(0);
  });

  it("applies a lower factor for female lifters", () => {
    // 80 × 0.45 × 0.75 = 27 → 27.5
    expect(
      startingWeightForCategory("horizontal_push", ctx({ sex: "female" }))
    ).toBe(27.5);
  });

  it("returns 0 when bodyweight is missing/invalid", () => {
    expect(
      startingWeightForCategory("knee_dominant", ctx({ bodyweightKg: 0 }))
    ).toBe(0);
    expect(
      startingWeightForCategory("knee_dominant", ctx({ bodyweightKg: NaN }))
    ).toBe(0);
  });
});

describe("seedStartingLoads", () => {
  it("reweights untrained MAIN lifts to the bodyweight-relative seed", () => {
    const out = seedStartingLoads(
      [day([ex({ movementCategory: "knee_dominant", weight: 80 })])],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(55); // 80 × 0.7 → 55
    expect(out[0].exercises[0].lastSuccessfulWeight).toBe(55);
  });

  it("never touches accessories", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            movementCategory: "knee_dominant",
            weight: 80,
            isAccessory: true,
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(80); // unchanged
  });

  it("never touches a lift with logged history (keeps progressed weight)", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            movementCategory: "knee_dominant",
            weight: 100,
            performanceHistory: [
              {
                date: "2026-01-01",
                weight: 100,
                repsCompleted: 5,
                repsTarget: 5,
              },
            ],
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(100); // history → untouched
  });

  it("leaves bodyweight lifts (weight 0) as bodyweight", () => {
    const out = seedStartingLoads(
      [day([ex({ movementCategory: "vertical_pull", weight: 0 })])],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(0);
  });

  it("does not mutate the input", () => {
    const input = [
      day([ex({ movementCategory: "knee_dominant", weight: 80 })]),
    ];
    seedStartingLoads(input, ctx());
    expect(input[0].exercises[0].weight).toBe(80);
  });
});

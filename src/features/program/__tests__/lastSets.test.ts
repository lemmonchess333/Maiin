import { describe, it, expect } from "vitest";
import { groupLastSets, lastSetsByExercise } from "../lastSets";
import type { WorkoutExercise, WorkoutSet } from "@/lib/savedWorkouts";

function set(
  weightKg: number,
  reps: number,
  /** null for a set saved before sets had types (D2). */
  type: string | null = "working"
): WorkoutSet {
  return { setNumber: 1, weightKg, reps, ...(type ? { type } : {}) };
}

function exercise(exerciseId: string, sets: WorkoutSet[]): WorkoutExercise {
  return {
    exerciseId,
    exerciseName: exerciseId,
    category: "Chest",
    sets,
    caloriesBurned: 0,
  };
}

describe("lastSetsByExercise", () => {
  it("keeps every set of the latest session, in order", () => {
    const map = lastSetsByExercise([
      {
        exercises: [exercise("bench", [set(60, 12), set(60, 12), set(60, 10)])],
      },
      { exercises: [exercise("bench", [set(57.5, 12)])] },
    ]);
    expect(map.get("bench")).toEqual([
      { weightKg: 60, reps: 12 },
      { weightKg: 60, reps: 12 },
      { weightKg: 60, reps: 10 },
    ]);
  });

  it("leaves out drop sets and typed warm-ups, as progression does", () => {
    const map = lastSetsByExercise([
      {
        exercises: [
          exercise("bench", [
            set(40, 5, "warmup"),
            set(80, 8),
            set(80, 6, "failure"),
            set(50, 12, "dropset"),
          ]),
        ],
      },
    ]);
    expect(map.get("bench")).toEqual([
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 6 },
    ]);
  });

  it("reads an untyped light set in an old document as a warm-up", () => {
    const map = lastSetsByExercise([
      {
        exercises: [
          exercise("squat", [
            set(40, 10, null),
            set(100, 5, null),
            set(100, 5, null),
          ]),
        ],
      },
    ]);
    expect(map.get("squat")).toEqual([
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
    ]);
  });

  it("keeps a light back-off set that is typed as working", () => {
    const map = lastSetsByExercise([
      { exercises: [exercise("squat", [set(100, 5), set(45, 12)])] },
    ]);
    expect(map.get("squat")).toEqual([
      { weightKg: 100, reps: 5 },
      { weightKg: 45, reps: 12 },
    ]);
  });

  it("keeps a bodyweight lift's sets at no weight", () => {
    const map = lastSetsByExercise([
      { exercises: [exercise("pull-ups", [set(0, 10), set(0, 8)])] },
    ]);
    expect(map.get("pull-ups")).toEqual([
      { weightKg: 0, reps: 10 },
      { weightKg: 0, reps: 8 },
    ]);
  });

  it("looks further back when the latest session counted no sets", () => {
    const map = lastSetsByExercise([
      { exercises: [exercise("bench", [set(50, 12, "dropset")])] },
      { exercises: [exercise("bench", [set(60, 10)])] },
    ]);
    expect(map.get("bench")).toEqual([{ weightKg: 60, reps: 10 }]);
  });
});

describe("groupLastSets", () => {
  it("groups one weight into one run", () => {
    expect(
      groupLastSets([
        { weightKg: 60, reps: 12 },
        { weightKg: 60, reps: 12 },
        { weightKg: 60, reps: 10 },
      ])
    ).toEqual([{ weightKg: 60, reps: [12, 12, 10] }]);
  });

  it("splits where the weight changes", () => {
    expect(
      groupLastSets([
        { weightKg: 100, reps: 5 },
        { weightKg: 90, reps: 5 },
        { weightKg: 90, reps: 5 },
      ])
    ).toEqual([
      { weightKg: 100, reps: [5] },
      { weightKg: 90, reps: [5, 5] },
    ]);
  });

  it("gives nothing for no sets", () => {
    expect(groupLastSets([])).toEqual([]);
  });
});

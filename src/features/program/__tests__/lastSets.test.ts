import { describe, it, expect } from "vitest";
import { groupLastSets, lastSetsByExercise, lastSetsBySlot } from "../lastSets";
import type { WorkoutExercise, WorkoutSet } from "@/lib/savedWorkouts";
import type { SavedProgrammeCompletion } from "@/lib/workoutCompletion";

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

/** A programme session saved with its completion: each exercise in a slot. */
function inSlots(...lifts: [slot: string, exercise: WorkoutExercise][]) {
  return {
    exercises: lifts.map(([, exercise]) => exercise),
    programmeCompletion: {
      context: {
        progression: {
          prescription: {
            exercises: lifts.map(([slot, exercise]) => ({
              exerciseId: exercise.exerciseId,
              instanceId: slot,
            })),
          },
        },
      },
    } as unknown as SavedProgrammeCompletion,
  };
}

describe("lastSetsBySlot", () => {
  /* One squat in two slots: 3×5 heavy, 2×9 light. */
  const heavy = { exerciseId: "squat", instanceId: "heavy" };
  const light = { exerciseId: "squat", instanceId: "light" };

  it("reads each slot's own last session when one exercise fills two", () => {
    const lastOf = lastSetsBySlot(
      [
        inSlots(["light", exercise("squat", [set(70, 9), set(65, 9)])]),
        inSlots([
          "heavy",
          exercise("squat", [set(85, 5), set(85, 5), set(80, 5)]),
        ]),
      ],
      [heavy, light]
    );
    expect(lastOf(heavy)).toEqual([
      { weightKg: 85, reps: 5 },
      { weightKg: 85, reps: 5 },
      { weightKg: 80, reps: 5 },
    ]);
    expect(lastOf(light)).toEqual([
      { weightKg: 70, reps: 9 },
      { weightKg: 65, reps: 9 },
    ]);
  });

  it("never reads a slot the plan still runs the exercise in for another", () => {
    /* A plan's first week: the heavy day has run, the light day hasn't.
       The heavy day's lighter last set is not the light day's start. */
    const lastOf = lastSetsBySlot(
      [
        inSlots([
          "heavy",
          exercise("squat", [set(85, 5), set(85, 5), set(80, 5)]),
        ]),
        { exercises: [exercise("squat", [set(60, 8)])] },
      ],
      [heavy, light]
    );
    // An older session that records no slot, a routine say, still counts.
    expect(lastOf(light)).toEqual([{ weightKg: 60, reps: 8 }]);
    expect(
      lastSetsBySlot(
        [inSlots(["heavy", exercise("squat", [set(85, 5)])])],
        [heavy, light]
      )(light)
    ).toBeUndefined();
  });

  it("reads a rebuilt plan's lifts from the old plan's sessions", () => {
    const lastOf = lastSetsBySlot(
      [inSlots(["old", exercise("squat", [set(85, 5), set(80, 5)])])],
      [{ exerciseId: "squat", instanceId: "new" }]
    );
    expect(lastOf({ exerciseId: "squat", instanceId: "new" })).toEqual([
      { weightKg: 85, reps: 5 },
      { weightKg: 80, reps: 5 },
    ]);
  });

  it("passes over a swap for the day when the slot's own lift comes back", () => {
    const lastOf = lastSetsBySlot(
      [
        inSlots(["heavy", exercise("goblet-squat", [set(24, 10)])]),
        inSlots(["heavy", exercise("squat", [set(85, 5)])]),
      ],
      [heavy]
    );
    expect(lastOf(heavy)).toEqual([{ weightKg: 85, reps: 5 }]);
  });

  it("reads by the exercise a session whose lists disagree", () => {
    /* The prescription and the saved exercises are one for one; when
       they aren't, no slot is trusted. */
    const session = inSlots(
      ["heavy", exercise("squat", [set(85, 5)])],
      ["press", exercise("overhead-press", [set(40, 5)])]
    );
    const lastOf = lastSetsBySlot(
      [{ ...session, exercises: session.exercises.slice(0, 1) }],
      [light]
    );
    expect(lastOf(light)).toEqual([{ weightKg: 85, reps: 5 }]);
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

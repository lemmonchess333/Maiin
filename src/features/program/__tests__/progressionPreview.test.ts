import { describe, it, expect } from "vitest";
import { buildProgressionPreview } from "../progressionPreview";
import type { ProgramExercise } from "../programTypes";
import { lbToKg } from "@/lib/weightUnits";

function makeExercise(
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 60,
    restSeconds: 120,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

describe("buildProgressionPreview", () => {
  it("steps up loaded lifts that hit all sets and rep ceiling under RPE 9.5", () => {
    const ex = makeExercise({ sets: 3, reps: 8, repRangeMax: 10 });
    const logs = [
      [
        { reps: 10, weight: 40, completed: true, type: "warmup" },
        { reps: 10, weight: 60, completed: true, type: "working", rpe: 8 },
        { reps: 10, weight: 60, completed: true, type: "working", rpe: 8.5 },
        { reps: 10, weight: 60, completed: true, type: "working", rpe: 9 },
      ],
    ];
    expect(buildProgressionPreview([ex], logs, "kg")).toEqual([
      {
        exerciseId: "bench-press",
        name: "Bench Press",
        detail: "62.5 kg next time",
      },
    ]);
  });

  it("formats lb kit loads cleanly", () => {
    const ex = makeExercise({ sets: 2, reps: 8 });
    const w = lbToKg(135);
    const logs = [
      [
        { reps: 8, weight: w, completed: true, type: "working" },
        { reps: 8, weight: w, completed: true, type: "working" },
      ],
    ];
    expect(buildProgressionPreview([ex], logs, "lbs")).toEqual([
      {
        exerciseId: "bench-press",
        name: "Bench Press",
        detail: "140 lb next time",
      },
    ]);
  });

  it("holds weight when the next step exceeds the 15% automatic jump ceiling", () => {
    const ex = makeExercise({
      name: "Dumbbell Bench Press",
      exerciseId: "db-bench",
      sets: 2,
      reps: 10,
    });
    const logs = [
      [
        { reps: 10, weight: 10, completed: true, type: "working" },
        { reps: 10, weight: 10, completed: true, type: "working" },
      ],
    ];
    expect(buildProgressionPreview([ex], logs, "kg")).toEqual([
      {
        exerciseId: "db-bench",
        name: "Dumbbell Bench Press",
        detail: "Holding weight, adding reps next time",
      },
    ]);
  });

  it("prompts bodyweight exercises at 0 kg to add load next time", () => {
    const ex = makeExercise({
      name: "Push-Ups",
      exerciseId: "push-ups",
      sets: 2,
      reps: 12,
      weight: 0,
    });
    const logs = [
      [
        { reps: 12, weight: 0, completed: true, type: "working" },
        { reps: 12, weight: 0, completed: true, type: "working" },
      ],
    ];
    expect(buildProgressionPreview([ex], logs, "kg")).toEqual([
      {
        exerciseId: "push-ups",
        name: "Push-Ups",
        detail: "Ready to add load next time",
      },
    ]);
  });

  it("skips timed exercises, incomplete sets, sub-target reps, and RPE >= 9.5", () => {
    const timed = makeExercise({
      name: "Plank",
      exerciseId: "plank",
      sets: 2,
      reps: 45,
      repUnit: "seconds",
    });
    const rpeTooHigh = makeExercise({
      name: "Squat",
      exerciseId: "squat",
      sets: 2,
      reps: 5,
    });
    const missedReps = makeExercise({
      name: "Row",
      exerciseId: "barbell-row",
      sets: 2,
      reps: 8,
    });
    const shortSets = makeExercise({
      name: "OHP",
      exerciseId: "overhead-press",
      sets: 3,
      reps: 8,
    });

    const logs = [
      [
        { reps: 60, weight: 0, completed: true, type: "working" },
        { reps: 60, weight: 0, completed: true, type: "working" },
      ],
      [
        { reps: 5, weight: 100, completed: true, type: "working", rpe: 9.5 },
        { reps: 5, weight: 100, completed: true, type: "working", rpe: 8.5 },
      ],
      [
        { reps: 8, weight: 60, completed: true, type: "working" },
        { reps: 7, weight: 60, completed: true, type: "working" },
      ],
      [
        { reps: 8, weight: 40, completed: true, type: "working" },
        { reps: 8, weight: 40, completed: true, type: "working" },
        { reps: 8, weight: 40, completed: false, type: "working" },
      ],
    ];

    expect(
      buildProgressionPreview(
        [timed, rpeTooHigh, missedReps, shortSets],
        logs,
        "kg"
      )
    ).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  computeTrainingMonotony,
  MONOTONY_MIN_ACTIVE_DAYS,
} from "../trainingMonotony";
import type { Workout } from "../savedWorkouts";
import type { SavedRun } from "../savedRuns";

const TODAY = "2026-11-25";

function makeWorkout(
  date: string,
  workingSets: number,
  rpe?: number
): Pick<Workout, "date" | "exercises"> {
  return {
    date,
    exercises: [
      {
        exerciseId: "squat",
        exerciseName: "Squat",
        category: "Legs",
        caloriesBurned: 200,
        sets: Array.from({ length: workingSets }, (_, idx) => ({
          setNumber: idx + 1,
          reps: 8,
          weightKg: 80,
          type: "working",
          ...(rpe != null ? { rpe } : {}),
        })),
      },
    ],
  };
}

function makeRun(
  day: string,
  durationMin: number,
  activityType = "easy",
  overrides: Partial<SavedRun> = {}
): Pick<
  SavedRun,
  | "day"
  | "date"
  | "duration"
  | "distance"
  | "activityType"
  | "type"
  | "relativeEffort"
  | "isInvalid"
  | "savedAnyway"
> {
  return {
    day,
    date: day,
    duration: durationMin * 60,
    distance: durationMin * 180,
    activityType,
    relativeEffort: null,
    ...overrides,
  };
}

describe("computeTrainingMonotony", () => {
  it("returns insufficient when fewer than 4 active days exist in the 7-day window", () => {
    const result = computeTrainingMonotony({
      workouts: [makeWorkout("2026-11-25", 16), makeWorkout("2026-11-23", 16)],
      runs: [makeRun("2026-11-21", 40)],
      todayKey: TODAY,
    });
    expect(result.status).toBe("insufficient");
    expect(result.activeDays).toBe(MONOTONY_MIN_ACTIVE_DAYS - 1);
  });

  it("reports high monotony (> 2.0) when all 7 days carry nearly identical load", () => {
    const days = [
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
    ];
    // Alternating identical-load lifts (16 sets = 40 AU) and 40-min runs (40 AU)
    const result = computeTrainingMonotony({
      workouts: days
        .filter((_, i) => i % 2 === 0)
        .map((d) => makeWorkout(d, 16)),
      runs: days
        .filter((_, i) => i % 2 === 1)
        .map((d) => makeRun(d, 40, "easy")),
      todayKey: TODAY,
    });
    expect(result.status).toBe("high");
    expect(result.monotony).toBeGreaterThan(2.0);
    expect(result.activeDays).toBe(7);
    expect(result.hasLift).toBe(true);
    expect(result.hasRun).toBe(true);
    expect(result.weeklyLoad).toBe(280);
  });

  it("reports varied (< 1.5) for a polarized hybrid week with rest and hard/easy swings", () => {
    const result = computeTrainingMonotony({
      workouts: [
        makeWorkout("2026-11-19", 20, 9), // hard lift (60 AU)
        makeWorkout("2026-11-22", 12, 7), // light lift (25.5 AU)
      ],
      runs: [
        makeRun("2026-11-20", 30, "easy"), // 30 AU
        makeRun("2026-11-24", 90, "long"), // 90 AU
        // 3 rest days (Nov 21, 23, 25) -> strong hard/easy contrast
      ],
      todayKey: TODAY,
    });
    expect(result.status).toBe("varied");
    expect(result.monotony).toBeLessThan(1.5);
    expect(result.activeDays).toBe(4);
    expect(result.strain).toBeGreaterThan(0);
  });

  it("ignores invalid runs unless savedAnyway, ignores warm-up sets, and ignores days outside the 7-day window", () => {
    const result = computeTrainingMonotony({
      workouts: [
        makeWorkout("2026-11-18", 20), // 8 days ago -> outside window
        {
          date: "2026-11-25",
          exercises: [
            {
              exerciseId: "bench",
              exerciseName: "Bench",
              category: "Chest",
              caloriesBurned: 50,
              sets: [{ setNumber: 1, reps: 10, weightKg: 20, type: "warmup" }],
            },
          ],
        },
        makeWorkout("2026-11-24", 16),
        makeWorkout("2026-11-22", 16),
        makeWorkout("2026-11-20", 16),
      ],
      runs: [
        makeRun("2026-11-23", 45, "easy", {
          isInvalid: true,
          savedAnyway: false,
        }),
      ],
      todayKey: TODAY,
    });
    expect(result.activeDays).toBe(3);
    expect(result.status).toBe("insufficient");
  });

  it("handles invalid date anchor safely", () => {
    const result = computeTrainingMonotony({
      workouts: [],
      runs: [],
      todayKey: "not-a-date",
    });
    expect(result.status).toBe("insufficient");
  });
});

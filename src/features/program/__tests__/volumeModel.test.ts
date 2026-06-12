import { describe, it, expect } from "vitest";
import {
  weeklyVolumeByMuscle,
  volumeLandmark,
  classifyVolume,
} from "../volumeModel";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

function ex(overrides: Partial<ProgramExercise>): ProgramExercise {
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
    ...overrides,
  };
}

function day(
  exercises: ProgramExercise[],
  over: Partial<WorkoutDay> = {}
): WorkoutDay {
  return {
    dayName: "D",
    dayType: "upper",
    completed: false,
    exercises,
    ...over,
  };
}

describe("weeklyVolumeByMuscle", () => {
  it("counts primary 1.0 and each secondary 0.5 (fractional volume)", () => {
    // bench-press: Pectorals (primary) + Triceps, Front Delts (secondary)
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })]),
    ]);
    const get = (m: string) => v.find((x) => x.muscle === m)?.sets;
    expect(get("Chest")).toBe(4); // primary 4 × 1.0
    expect(get("Triceps")).toBe(2); // secondary 4 × 0.5
    expect(get("Shoulders")).toBe(2); // Front Delts → Shoulders, 4 × 0.5
  });

  it("sums across days and exercises", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 3 })]),
      day([ex({ exerciseId: "bench-press", sets: 3 })]),
    ]);
    expect(v.find((x) => x.muscle === "Chest")?.sets).toBe(6);
  });

  it("excludes skipped days (no stimulus)", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })], { skipped: true }),
    ]);
    expect(v).toEqual([]);
  });

  it("ignores zero-set and non-positive entries", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 0 })]),
    ]);
    expect(v).toEqual([]);
  });

  it("falls back to movement category for custom (non-DB) exercises", () => {
    const v = weeklyVolumeByMuscle([
      day([
        ex({
          exerciseId: "my-custom-lift",
          movementCategory: "knee_dominant",
          sets: 5,
        }),
      ]),
    ]);
    expect(v.find((x) => x.muscle === "Quads")?.sets).toBe(5);
  });

  it("returns muscles in canonical display order", () => {
    const v = weeklyVolumeByMuscle([
      day([
        ex({ exerciseId: "bench-press", sets: 3 }), // Chest, Triceps, Shoulders
      ]),
    ]);
    const order = v.map((x) => x.muscle);
    // Chest before Shoulders before Triceps per CANONICAL_MUSCLE_ORDER
    expect(order.indexOf("Chest")).toBeLessThan(order.indexOf("Shoulders"));
    expect(order.indexOf("Shoulders")).toBeLessThan(order.indexOf("Triceps"));
  });
});

describe("volumeLandmark + classifyVolume", () => {
  it("hypertrophy carries the highest target band", () => {
    expect(volumeLandmark("hypertrophy")).toEqual({ low: 12, high: 20 });
    expect(volumeLandmark("strength")).toEqual({ low: 8, high: 14 });
  });

  it("classifies under / optimal / high against the band", () => {
    const lm = volumeLandmark("hypertrophy"); // 12..20
    expect(classifyVolume(8, lm)).toBe("low");
    expect(classifyVolume(14, lm)).toBe("optimal");
    expect(classifyVolume(24, lm)).toBe("high");
    expect(classifyVolume(12, lm)).toBe("optimal"); // inclusive low
    expect(classifyVolume(20, lm)).toBe("optimal"); // inclusive high
  });
});

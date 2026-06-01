/**
 * Pgm5 equipment follow-up — applyEquipmentFilterToWorkouts.
 *
 * In-place equipment-aware re-pick. Pins: full_gym no-op; a Barbell exercise
 * is swapped to a same-category Dumbbells/Bodyweight option at home_gym
 * (carrying weight/history); an already-available exercise is kept; unknown
 * ids are left untouched; structure (day + exercise counts) preserved.
 *
 * Fixtures use real bank ids: "bench-press" (Barbell, horizontal_push) has a
 * "db-bench" (Dumbbells) category-mate; "db-row" (Dumbbells) is already fine.
 */
import { describe, it, expect } from "vitest";
import { applyEquipmentFilterToWorkouts } from "../matchTemplate";
import { getExerciseById } from "@/lib/exercises";
import type {
  WorkoutDay,
  ProgramExercise,
  MovementCategory,
} from "../programTypes";

function ex(
  exerciseId: string,
  name: string,
  movementCategory: MovementCategory,
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name,
    exerciseId,
    movementCategory,
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
  dayName: "Push",
  dayType: "push",
  completed: false,
  exercises,
});

const HOME_OK = new Set(["Dumbbells", "Bodyweight", "Kettlebell"]);

describe("applyEquipmentFilterToWorkouts", () => {
  it("full_gym is a no-op (barbell exercise kept)", () => {
    const w = [day([ex("bench-press", "Bench Press", "horizontal_push")])];
    const out = applyEquipmentFilterToWorkouts(w, "full_gym");
    expect(out[0].exercises[0].exerciseId).toBe("bench-press");
  });

  it("swaps a Barbell exercise to an available category-mate at home_gym, carrying load", () => {
    const w = [
      day([
        ex("bench-press", "Bench Press", "horizontal_push", { weight: 80 }),
      ]),
    ];
    const out = applyEquipmentFilterToWorkouts(w, "home_gym");
    const swapped = out[0].exercises[0];
    expect(swapped.exerciseId).not.toBe("bench-press"); // barbell removed
    expect(HOME_OK.has(getExerciseById(swapped.exerciseId)!.equipment)).toBe(
      true
    );
    expect(swapped.weight).toBe(80); // load carried
    expect(swapped.notes).toMatch(/not available with your equipment/i);
  });

  it("keeps an already-available exercise (Dumbbells at home_gym)", () => {
    const w = [day([ex("db-row", "Dumbbell Row", "horizontal_pull")])];
    const out = applyEquipmentFilterToWorkouts(w, "home_gym");
    expect(out[0].exercises[0].exerciseId).toBe("db-row");
  });

  it("leaves an unknown/custom exercise id untouched", () => {
    const w = [day([ex("user-custom-thing", "Custom", "horizontal_push")])];
    const out = applyEquipmentFilterToWorkouts(w, "minimal");
    expect(out[0].exercises[0].exerciseId).toBe("user-custom-thing");
  });

  it("preserves day + exercise counts (structure)", () => {
    const w = [
      day([
        ex("bench-press", "Bench Press", "horizontal_push"),
        ex("db-row", "Dumbbell Row", "horizontal_pull"),
      ]),
    ];
    const out = applyEquipmentFilterToWorkouts(w, "minimal");
    expect(out).toHaveLength(1);
    expect(out[0].exercises).toHaveLength(2);
  });
});

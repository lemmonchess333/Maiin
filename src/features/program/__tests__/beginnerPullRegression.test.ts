import { describe, expect, it } from "vitest";
import { buildPlan } from "../planBuilder";
import { applyEquipmentFilterToWorkouts } from "../matchTemplate";
import { getExerciseById } from "@/lib/exercises";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

function exercise(
  exerciseId: string,
  movementCategory: ProgramExercise["movementCategory"]
): ProgramExercise {
  return {
    exerciseId,
    name: exerciseId,
    movementCategory,
    sets: 2,
    reps: 8,
    weight: 20,
    progressionType: "double",
    isAccessory: true,
    lastSuccessfulWeight: 20,
    lastAttemptedWeight: 20,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  };
}

const pullDay = (): WorkoutDay => ({
  dayName: "Pull",
  dayType: "pull",
  completed: false,
  exercises: [
    exercise("inverted-row", "horizontal_pull"),
    exercise("db-row", "horizontal_pull"),
    exercise("lat-pulldown", "vertical_pull"),
  ],
});

describe("beginner pulling with limited equipment", () => {
  // A barbell and a rack at home: the inverted row needs a bar at waist
  // height (`RACK_EXERCISE_IDS`), so this day can hold one.
  it("uses a scalable row when the usual inverted-row regression is already in the session", () => {
    const input = [pullDay()];
    const before = JSON.stringify(input);
    const out = applyEquipmentFilterToWorkouts(
      input,
      "minimal",
      [],
      "beginner",
      undefined,
      true
    );
    const replacement = out[0].exercises[2];
    // With the rack, the barbell row is the next row the kit has.
    expect(replacement.exerciseId).toBe("barbell-row");
    expect(replacement.movementCategory).toBe("horizontal_pull");
    expect(getExerciseById(replacement.exerciseId)?.equipment).toBe("Barbell");
    expect(new Set(out[0].exercises.map((e) => e.exerciseId)).size).toBe(3);
    expect(JSON.stringify(input)).toBe(before);
    expect(
      applyEquipmentFilterToWorkouts(
        out,
        "minimal",
        [],
        "beginner",
        undefined,
        true
      )
    ).toEqual(out);
  });

  it("takes a dumbbell row for the inverted row without a rack to row under", () => {
    const out = applyEquipmentFilterToWorkouts(
      [pullDay()],
      "minimal",
      [],
      "beginner"
    );
    const ids = out[0].exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("inverted-row");
    expect(ids).not.toContain("pull-ups");
    expect(ids[0]).toBe("chest-supported-db-row");
    expect(getExerciseById(ids[0])?.equipment).toBe("Dumbbells");
  });

  it("keeps pull-ups available to an experienced lifter", () => {
    const out = applyEquipmentFilterToWorkouts(
      [pullDay()],
      "minimal",
      [],
      "intermediate"
    );
    expect(out[0].exercises[2].exerciseId).toBe("pull-ups");
  });

  it.each([
    "strength",
    "hypertrophy",
    "fat_loss",
    "general",
    "running",
  ] as const)(
    "%s: complete five- and six-day beginner plans do not restore unassisted pull-ups",
    (primaryGoal) => {
      for (const liftDays of [5, 6]) {
        for (const equipment of ["home_gym", "minimal"] as const) {
          for (const barbellAtHome of [false, true]) {
            const plan = buildPlan({
              primaryGoal,
              nutritionPhase: "recomp",
              experience: "beginner",
              bodyweightKg: 80,
              sex: "male",
              liftDays,
              sessionMinutes: 75,
              preferredSplit: "auto",
              runMode: "freeform",
              weeklyRunDays: 0,
              equipment,
              barbellAtHome,
              injuries: [],
              currentDate: "2026-11-05",
            });
            const exercises = plan.programState.workouts.flatMap(
              (d) => d.exercises
            );
            expect(exercises.length).toBeGreaterThan(0);
            expect(
              exercises.filter((e) =>
                ["pull-ups", "chin-ups"].includes(e.exerciseId)
              )
            ).toEqual([]);
            for (const day of plan.programState.workouts) {
              expect(new Set(day.exercises.map((e) => e.exerciseId)).size).toBe(
                day.exercises.length
              );
            }
          }
        }
      }
    },
    30_000
  );
});

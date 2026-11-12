/**
 * What a plan for a sore lower back holds (training deep dive, D2).
 *
 * Swept on main's code before this change, over 2,700 plans (three levels,
 * both sexes, five goals, two to six days, three kits, four lengths): the
 * kettlebell swing stood in for the Romanian deadlift in 380 slots, up to
 * 102% of the deadlift the same person would have been given; crunches,
 * the cable crunch and the hanging leg raise held 1,964 slots; and the
 * table offered the rack pull, the deadlift from the knee at more weight,
 * as safe. After it: no swing, no rack pull and no loaded trunk flexion,
 * and no hinge above 71% of that deadlift.
 */
import { describe, expect, it } from "vitest";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { getExerciseById } from "@/lib/exercises";
import type { Experience, PrimaryGoal, WorkoutDay } from "../programTypes";

const NEVER = new Set([
  "rack-pull",
  "kettlebell-swing",
  "crunches",
  "cable-crunch",
  "decline-sit-up",
  "leg-raise",
]);

/** The heaviest a hinge may start at, as a share of the deadlift the same
 *  person would be given with no injury. */
const MOST_OF_THE_DEADLIFT = 0.75;

function input(
  experience: Experience,
  primaryGoal: PrimaryGoal,
  liftDays: number,
  equipment: string,
  injuries: string[]
): PlanBuilderInput {
  return {
    primaryGoal,
    nutritionPhase: "recomp",
    experience,
    bodyweightKg: 80,
    sex: "male",
    liftDays,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment,
    injuries,
    sessionMinutes: 60,
    currentDate: "2026-03-08",
  } as PlanBuilderInput;
}

const lifts = (workouts: WorkoutDay[]) => workouts.flatMap((d) => d.exercises);

describe("a plan for a sore lower back", () => {
  it("holds no swing, rack pull or loaded crunch, and no heavy hinge", () => {
    const issues: string[] = [];
    for (const experience of [
      "beginner",
      "intermediate",
      "advanced",
    ] as Experience[])
      for (const goal of [
        "strength",
        "hypertrophy",
        "fat_loss",
        "general",
        "running",
      ] as PrimaryGoal[])
        for (const liftDays of [2, 3, 4, 6])
          for (const equipment of ["full_gym", "home_gym", "minimal"]) {
            const config = `${experience}/${goal}/${liftDays}d/${equipment}`;
            const deadlift =
              lifts(
                buildPlan(input(experience, goal, liftDays, "full_gym", []))
                  .programState.workouts
              ).find((ex) => ex.exerciseId === "deadlift")?.weight ?? 0;
            const plan = buildPlan(
              input(experience, goal, liftDays, equipment, ["lower_back"])
            ).programState.workouts;
            for (const ex of lifts(plan)) {
              if (NEVER.has(ex.exerciseId))
                issues.push(`${config}: ${ex.exerciseId}`);
              const perHand =
                getExerciseById(ex.exerciseId)?.equipment === "Dumbbells";
              if (
                ex.movementCategory === "hip_dominant" &&
                !perHand &&
                deadlift > 0 &&
                ex.weight > deadlift * MOST_OF_THE_DEADLIFT
              )
                issues.push(
                  `${config}: ${ex.exerciseId} ${String(ex.weight)} kg of a ${String(deadlift)} kg deadlift`
                );
            }
          }
    expect(issues).toEqual([]);
  }, 120_000);
});

/**
 * Every plan the generator builds keeps the injury promises (Lift4 (11)).
 *
 * The injury options promise what changes, and `PROMISED` below spells out,
 * from each option's words, the lifts the generator can give that the
 * promise covers. Across the goals, day counts and equipment a plan can be
 * built for, with each injury and with all five: none of those lifts stays
 * in the plan; nothing in it needs equipment the person said they don't
 * have, or, where nothing safe is left, the lift says so; no day holds a
 * lift twice; and the next save swaps nothing more, since no substitute is itself named for the injury it was chosen
 * for. The list is written here, not read from `CONTRAINDICATED`, so the
 * table can't drop a lift without this failing.
 *
 * It replaces the sweep that ran the same checks over the hand-written
 * templates, which no longer build plans.
 */
import { describe, it, expect } from "vitest";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { getExerciseById } from "@/lib/exercises";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";

/**
 * The injuries a home gym or a minimal setup can always work around. With a
 * sore elbow there is one safe triceps lift without a cable (the
 * kickback), so a push day with two triceps slots, and a plan with every
 * injury at once, can be left a lift the person can't do: safety comes
 * first, and the lift says so and asks them to replace it.
 */
const STRICT = new Set(["lower_back", "knee", "shoulder", "wrist"]);

/** What a home gym and a minimal setup train with (`matchTemplate.ts`). */
const OWNED: Record<string, ReadonlySet<string> | undefined> = {
  home_gym: new Set(["Dumbbells", "Bodyweight", "Kettlebell"]),
  minimal: new Set(["Dumbbells", "Bodyweight"]),
};

/** The generator's lifts each injury option's words name. */
const PROMISED: Record<string, readonly string[]> = {
  // "We'll avoid heavy axial loading"
  lower_back: [
    "deadlift",
    "db-rdl",
    "barbell-row",
    "squat",
    "front-squat",
    "overhead-press",
  ],
  // "We'll adjust squat and lunge variations"
  knee: ["squat", "front-squat", "hack-squat", "leg-press"],
  // "We'll modify pressing movements"
  shoulder: [
    "overhead-press",
    "db-shoulder-press",
    "arnold-press",
    "bench-press",
    "tricep-dips",
    "pull-ups",
  ],
  // "We'll swap heavy curls/dips for cable work"
  elbow: [
    "barbell-curl",
    "db-curl",
    "chin-ups",
    "pull-ups",
    "tricep-dips",
    "skull-crushers",
    "overhead-extension",
  ],
  // "We'll pick neutral-grip and machine variants"
  wrist: [
    "bench-press",
    "overhead-press",
    "barbell-curl",
    "front-squat",
    "skull-crushers",
    "tricep-dips",
  ],
};

const GOALS: PrimaryGoal[] = [
  "strength",
  "hypertrophy",
  "fat_loss",
  "general",
  "running",
];
const EQUIPMENT = ["full_gym", "home_gym", "minimal"] as const;
const INJURY_SETS = [
  ["lower_back"],
  ["knee"],
  ["shoulder"],
  ["elbow"],
  ["wrist"],
  ["lower_back", "knee", "shoulder", "elbow", "wrist"],
];

function input(
  primaryGoal: PrimaryGoal,
  liftDays: number,
  equipment: (typeof EQUIPMENT)[number],
  injuries: string[]
): PlanBuilderInput {
  return {
    primaryGoal,
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 80,
    sex: "male",
    liftDays,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment,
    injuries,
    currentDate: "2026-03-08",
  } as PlanBuilderInput;
}

const ids = (workouts: WorkoutDay[]) =>
  workouts.map((d) => d.exercises.map((e) => e.exerciseId));

describe("injury coverage over the generator's plans", () => {
  it.each(INJURY_SETS.map((s) => [s.join("+"), s] as const))(
    "%s: swapped, once, with nothing left that the promise names",
    (_label, injuries) => {
      const issues: string[] = [];
      for (const goal of GOALS) {
        for (const liftDays of [2, 3, 4, 6]) {
          for (const equipment of EQUIPMENT) {
            const config = `${goal}/${liftDays}d/${equipment}`;
            const plan = buildPlan(
              input(goal, liftDays, equipment, [...injuries])
            ).programState;
            for (const day of plan.workouts) {
              const seen = new Set<string>();
              for (const ex of day.exercises) {
                if (seen.has(ex.exerciseId))
                  issues.push(`${config} ${day.dayName}: ${ex.exerciseId} x2`);
                seen.add(ex.exerciseId);
                const kit = getExerciseById(ex.exerciseId)?.equipment;
                const said = ex.notes?.includes(
                  "needs equipment you don't have"
                );
                if (
                  kit &&
                  OWNED[equipment] &&
                  !OWNED[equipment]!.has(kit) &&
                  (STRICT.has(injuries.join("+")) || !said)
                )
                  issues.push(
                    `${config} ${day.dayName}: ${ex.exerciseId} needs ${kit}`
                  );
                const named = injuries.filter((i) =>
                  PROMISED[i].includes(ex.exerciseId)
                );
                if (named.length > 0)
                  issues.push(
                    `${config} ${day.dayName}: ${ex.exerciseId} [${named.join(",")}]`
                  );
              }
            }
            const again = buildPlan({
              ...input(goal, liftDays, equipment, [...injuries]),
              existingState: plan,
              preserveHistory: true,
            }).programState;
            if (
              JSON.stringify(ids(again.workouts)) !==
              JSON.stringify(ids(plan.workouts))
            )
              issues.push(`${config}: the next save swapped again`);
          }
        }
      }
      expect(issues).toEqual([]);
    }
  );
});

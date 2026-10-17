/**
 * Lift15 — a new level never leaves a day over its length that fitted
 * before it. An intermediate's heavier, lower-rep main lifts take more
 * warm-ups; such a day gets Lift7's re-fit (sets only, no lift dropped). A
 * day over before the save, and a week that holds fewer sets already, are
 * left as they are. An injury or kit save is not re-fitted: its swaps come
 * back with the injury or the kit, and a cut would outlast them
 * (`planBuilder.test.ts`, "a save that lifts an injury brings back…").
 */
import { describe, it, expect } from "vitest";
import { buildPlan } from "../planBuilder";
import { sessionFits } from "../sessionFit";
import type { ProgramState } from "../programTypes";

type Answers = {
  experience: string;
  injuries?: string[];
  existing?: ProgramState;
  previousExperience?: string;
};

const plan = (a: Answers) =>
  buildPlan({
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: a.experience,
    bodyweightKg: 80,
    sex: "male",
    liftDays: 2,
    sessionMinutes: 45,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: a.injuries ?? ["none"],
    currentDate: "2026-09-07",
    ...(a.existing
      ? {
          existingState: a.existing,
          preserveHistory: true,
          previousSessionMinutes: 45,
          previousExperience: a.previousExperience ?? a.experience,
        }
      : { preserveHistory: false }),
  } as never).programState;

const fits = (state: ProgramState) =>
  state.workouts.map((day) => sessionFits(day.exercises, 45));

const setsOf = (state: ProgramState) =>
  state.workouts.map((day) => day.exercises.map((e) => e.sets));

describe("a new level keeps a fitted day inside its length (Lift15)", () => {
  const beginner = plan({ experience: "beginner" });

  it("starts from a two-day, 45-minute week that fits", () => {
    expect(fits(beginner)).toEqual([true, true]);
  });

  it("re-fits the day a new level's heavier main lifts take over", () => {
    const levelled = plan({
      experience: "intermediate",
      existing: beginner,
      previousExperience: "beginner",
    });
    expect(fits(levelled)).toEqual([true, true]);
    // Sets only: every lift is still there, in its place.
    expect(
      levelled.workouts.map((d) => d.exercises.map((e) => e.exerciseId))
    ).toEqual(
      beginner.workouts.map((d) => d.exercises.map((e) => e.exerciseId))
    );
    // A main lift keeps at least two sets, and a cut moves the volume
    // anchor with it.
    for (const day of levelled.workouts)
      for (const ex of day.exercises) {
        if (!ex.isAccessory) expect(ex.sets).toBeGreaterThanOrEqual(2);
        expect(ex.baseSets).toBe(ex.sets);
      }
  });

  it("leaves a day that was over before the save as it is", () => {
    // The person added two lifts to the first day: it runs over already.
    const added = structuredClone(beginner);
    const first = added.workouts[0];
    first.exercises.push(
      {
        ...first.exercises[0],
        instanceId: "added-1",
        exerciseId: "leg-press",
        name: "Leg Press",
        isAccessory: true,
        sets: 4,
        baseSets: 4,
      },
      {
        ...first.exercises[0],
        instanceId: "added-2",
        exerciseId: "db-curl",
        name: "Dumbbell Curl",
        isAccessory: true,
        sets: 4,
        baseSets: 4,
      }
    );
    expect(sessionFits(first.exercises, 45)).toBe(false);
    const kept = plan({
      experience: "intermediate",
      existing: added,
      previousExperience: "beginner",
    });
    expect(kept.workouts[0].exercises.map((e) => e.sets)).toEqual(
      first.exercises.map((e) => e.sets)
    );
  });

  it("waits for an ordinary week: a lighter week holds fewer sets already", () => {
    const lighter = {
      ...structuredClone(beginner),
      currentPhase: "deload",
    } as ProgramState;
    const levelled = plan({
      experience: "intermediate",
      existing: lighter,
      previousExperience: "beginner",
    });
    expect(setsOf(levelled)).toEqual(setsOf(lighter));
  });
});

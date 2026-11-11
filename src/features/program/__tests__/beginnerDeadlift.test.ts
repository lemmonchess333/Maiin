/**
 * L7 (decisions.md, "The beginner's deadlift"): the beginner full body
 * keeps its deadlift 3 × 8 twice a week.
 *
 * End to end through `buildPlan`, on the audit's plan (lifting-engine-audit
 * §6.2, P1): a beginner, three days of Build muscle at an hour, full gym,
 * 80 kg. Its hamstrings read over the beginner ceiling, both deadlifts, the
 * squats and the leg press crediting them, and since Lift21 that is a
 * reading the Weekly volume card shows: no ceiling takes a set or a lift
 * out of a plan the builder makes. A plan the person has keeps its lifts
 * through a new session length, as it always did.
 */
import { describe, it, expect } from "vitest";

import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { toExperience } from "../experienceModel";
import {
  judgementLandmark,
  weeklyVolumeByJudgementMuscle,
  type JudgementMuscle,
} from "../volumeModel";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";

function input(over: Partial<PlanBuilderInput> = {}): PlanBuilderInput {
  return {
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "beginner",
    sessionMinutes: 60,
    bodyweightKg: 80,
    sex: "male",
    liftDays: 3,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    currentDate: "2026-03-09",
    ...over,
  } as PlanBuilderInput;
}

const workoutsFor = (over: Partial<PlanBuilderInput> = {}) =>
  buildPlan(input(over)).programState.workouts;

const setsOf = (workouts: readonly WorkoutDay[], muscle: JudgementMuscle) =>
  weeklyVolumeByJudgementMuscle(workouts).find((v) => v.muscle === muscle)
    ?.sets ?? 0;

const ceiling = (
  goal: PrimaryGoal,
  muscle: JudgementMuscle,
  experience = "beginner"
) => judgementLandmark(goal, muscle, toExperience(experience)).high;

/** The lifts of a week, `id` for a main lift and `id~` for a supporting
 *  one, by day. */
const liftsOf = (workouts: readonly WorkoutDay[]) =>
  workouts.map((d) =>
    d.exercises.map((e) => `${e.exerciseId}${e.isAccessory ? "~" : ""}`)
  );

const daysWith = (workouts: readonly WorkoutDay[], exerciseId: string) =>
  workouts.filter((d) => d.exercises.some((e) => e.exerciseId === exerciseId))
    .length;

describe("the beginner full body's deadlift (L7)", () => {
  const workouts = workoutsFor();

  it("is 3 × 8 on both of its days, like every main lift", () => {
    const deadliftDays = workouts.filter((d) =>
      d.exercises.some(
        (e) => e.exerciseId === "deadlift" && e.isAccessory !== true
      )
    );
    expect(deadliftDays.map((d) => d.dayName)).toEqual([
      "Full Body — Deadlift Focus",
      "Full Body — Posterior Focus",
    ]);
    for (const ex of workouts.flatMap((d) => d.exercises)) {
      if (ex.isAccessory === true) continue;
      expect(`${ex.exerciseId} ${ex.sets} × ${ex.reps}`).toBe(
        `${ex.exerciseId} 3 × 8`
      );
    }
  });

  it("keeps its hinge work with the hamstrings over their ceiling (Lift21)", () => {
    expect(setsOf(workouts, "Hamstrings")).toBeGreaterThan(
      ceiling("hypertrophy", "Hamstrings")
    );
    expect(liftsOf(workouts).flat()).toContain("seated-leg-curl~");
  });

  it("is the deadlift on one day of a two-day week and supports the other", () => {
    // Two days of Get stronger at 75 minutes: a beginner is not offered
    // the Romanian deadlift, so the squat day's hinge is a deadlift too.
    const twoDays = workoutsFor({
      primaryGoal: "strength",
      liftDays: 2,
      sessionMinutes: 75,
    });
    expect(
      liftsOf(twoDays).map((day) => day.filter((l) => /^deadlift/.test(l)))
    ).toEqual([["deadlift~"], ["deadlift"]]);
    // In either slot it is the main lift's row: three sets of five.
    expect(
      twoDays
        .flatMap((d) => d.exercises)
        .filter((e) => e.exerciseId === "deadlift")
        .map((e) => `${e.sets} × ${e.reps}`)
    ).toEqual(["2 × 5", "3 × 5"]);

    // A home gym with a barbell keeps the deadlift to its two days: the
    // equipment swap gives no lift a third (`swapTwiceAWeek.test.ts`).
    const home = workoutsFor({ equipment: "home_gym", barbellAtHome: true });
    expect(daysWith(home, "deadlift")).toBe(2);
  });

  it("keeps the lifts of a plan the person has when a save re-fits it to a new length", () => {
    // A lift the person holds on a day stays through a new session length,
    // which re-fits sets only.
    const built = buildPlan(input()).programState;
    const legCurl = {
      ...built.workouts[0].exercises[0],
      name: "Seated Leg Curl",
      exerciseId: "seated-leg-curl",
      instanceId: "their-leg-curl",
      movementCategory: "hip_dominant" as const,
      isAccessory: true,
      sets: 2,
      baseSets: 2,
      reps: 10,
      baseReps: 10,
      weight: 30,
    };
    const theirs = {
      ...built,
      workouts: built.workouts.map((d, i) =>
        i === 0 ? { ...d, exercises: [...d.exercises, legCurl] } : d
      ),
    };
    const refitted = buildPlan(
      input({
        sessionMinutes: 75,
        previousSessionMinutes: 60,
        existingState: theirs,
        preserveHistory: true,
      })
    ).programState.workouts;
    expect(
      refitted
        .flatMap((d) => d.exercises)
        .filter((e) => e.instanceId === "their-leg-curl")
        .map((e) => `${e.exerciseId} ${e.sets}`)
    ).toEqual(["seated-leg-curl 2"]);
  });
});

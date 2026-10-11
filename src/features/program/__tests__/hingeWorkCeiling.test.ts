/**
 * L7 (decisions.md, "The beginner's deadlift"): the beginner full body
 * keeps its deadlift 3 × 8 twice a week, and the hamstrings' breach of
 * Lift4 (5)'s ceiling is fixed by taking sets off the hinge work, not the
 * deadlift off a day.
 *
 * The audit's plan (lifting-engine-audit §6.2, P1): a beginner, three days
 * of Build muscle at an hour, full gym, 80 kg. Its hamstrings read 15 sets a
 * week against the beginner ceiling of 13: both deadlifts, the squats and
 * the leg press credit them at 1:1 (ADR-0010), and the seated leg curl, the
 * hinge accessory on the squat day, takes them past it.
 *
 * End to end through `buildPlan`, so the role table, the time fit and the
 * balance all run. The hinge work gives way in two steps: the reconciler
 * takes sets off it down to its floor (`reconcileToLandmarks`), and a new
 * plan lets a hinge accessory at its floor go (`hingeAccessoryPastCeiling`)
 * when the week is the better for it. A plan the person has keeps its lifts.
 */
import { describe, it, expect } from "vitest";

import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { toExperience } from "../experienceModel";
import {
  judgementLandmark,
  weeklyVolumeByJudgementMuscle,
  type JudgementMuscle,
} from "../volumeModel";
import { daysPerMuscle } from "../weeklyFrequency";
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

describe("the beginner full body's hamstrings (L7)", () => {
  const workouts = workoutsFor();

  it("stay within the beginner ceiling", () => {
    expect(ceiling("hypertrophy", "Hamstrings")).toBe(13);
    expect(setsOf(workouts, "Hamstrings")).toBeLessThanOrEqual(13);
  });

  it("keep the deadlift 3 × 8 on both of its days, and every main lift's sets", () => {
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

  it("let the seated leg curl go, and its day gets back the calf raise the time fit had let go", () => {
    expect(liftsOf(workouts).flat()).not.toContain("seated-leg-curl~");
    const squatDay = workouts.find(
      (d) => d.dayName === "Full Body — Squat Focus"
    );
    expect(squatDay?.exercises.map((e) => e.exerciseId)).toContain(
      "standing-calf-raise"
    );
    // The leg curl counted toward the calves too (its secondary), so they
    // keep their second day through the raise.
    expect(daysPerMuscle(workouts).get("Calves")).toBe(2);
  });
});

describe("the hinge work gives way, never the deadlift off a day (L7)", () => {
  it("keeps a deadlift in a supporting slot: it is the deadlift on one of its days", () => {
    // Two days of Get stronger at 75 minutes: the deadlift leads day B and
    // supports day A, and the hamstrings read 10 against 9. Letting the
    // supporting deadlift go would bring them within it, and leave the
    // deadlift once a week.
    const twoDays = workoutsFor({
      primaryGoal: "strength",
      liftDays: 2,
      sessionMinutes: 75,
    });
    expect(setsOf(twoDays, "Hamstrings")).toBeGreaterThan(
      ceiling("strength", "Hamstrings")
    );
    expect(
      liftsOf(twoDays).map((day) => day.filter((l) => /^deadlift/.test(l)))
    ).toEqual([["deadlift~"], ["deadlift"]]);

    // A home gym with a barbell: the equipment swap gives the squat day a
    // supporting deadlift as well, and it stays.
    const home = workoutsFor({ equipment: "home_gym", barbellAtHome: true });
    expect(daysWith(home, "deadlift")).toBe(3);
  });

  it("leaves a hinge accessory that is a muscle's second day", () => {
    // Get stronger at 45 minutes: the leg curl's calf credit is the calves'
    // second day, and the time it frees doesn't bring the raise back.
    const workouts = workoutsFor({
      primaryGoal: "strength",
      sessionMinutes: 45,
    });
    expect(liftsOf(workouts).flat()).toContain("seated-leg-curl~");
    expect(daysPerMuscle(workouts).get("Calves")).toBe(2);
  });

  it("leaves a hinge accessory whose time would take another muscle over its ceiling", () => {
    // Four days of Get stronger at 45 minutes: without the leg curl the
    // deadlift gets its third set back and a hack squat returns, which take
    // the glutes to 13 against 12.
    const workouts = workoutsFor({
      primaryGoal: "strength",
      liftDays: 4,
      sessionMinutes: 45,
    });
    expect(liftsOf(workouts).flat()).toContain("seated-leg-curl~");
    expect(setsOf(workouts, "Glutes")).toBeLessThanOrEqual(
      ceiling("strength", "Glutes")
    );
  });

  it("takes a set off a glute bridge before anything comes out", () => {
    // Four days of Support my running at home for an intermediate: the
    // glute bridge's third set took the hamstrings to 15 against 14. It is a
    // hinge, so the reconciler takes the set; the lift stays.
    const workouts = workoutsFor({
      primaryGoal: "running",
      experience: "intermediate",
      liftDays: 4,
      equipment: "home_gym",
    });
    const bridges = workouts
      .flatMap((d) => d.exercises)
      .filter((e) => e.exerciseId === "glute-bridge");
    expect(bridges.map((e) => e.sets)).toEqual([2]);
    expect(setsOf(workouts, "Hamstrings")).toBe(
      ceiling("running", "Hamstrings", "intermediate")
    );
  });

  it("keeps the lifts of a plan the person has when a save re-fits it to a new length", () => {
    // A beginner whose plan was built before the hinge work gave way still
    // has the seated leg curl. A new session length re-fits sets only.
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
    // Over the ceiling, where a new plan would let the leg curl go…
    expect(setsOf(refitted, "Hamstrings")).toBeGreaterThan(
      ceiling("hypertrophy", "Hamstrings")
    );
    // …and still theirs, as it was.
    expect(
      refitted
        .flatMap((d) => d.exercises)
        .filter((e) => e.instanceId === "their-leg-curl")
        .map((e) => `${e.exerciseId} ${e.sets}`)
    ).toEqual(["seated-leg-curl 2"]);
  });
});

/**
 * The level gate leaves a lift the injury filter put in where it is.
 *
 * `generateProgram` gates for the person's level, then swaps for their
 * injuries and kit, keeping each lift to two days a week. `buildLiftProgram`
 * gates the plan it gets back a second time, for the template a setup seeds,
 * which `generateProgram` never sees. On a generated plan that second gate
 * undid injury swaps: the injury filter may give a beginner a technical lift
 * when it is the one on the curated list that spares the injury (its one
 * documented exception to the gate), and the gate put back the simplest lift
 * of the category instead, with no regard for the injuries or the cap. A sore
 * back's squat became a third leg press; with a barbell at home, its
 * deadlift became a third hip thrust.
 *
 * End to end through `buildPlan`, as the person gets the plan.
 */
import { describe, it, expect } from "vitest";

import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { MAX_WEEKLY_LIFT_EXPOSURES } from "../overlapModel";
import {
  INJURY_SUBSTITUTIONS,
  contraindicatedFor,
} from "../injurySubstitutions";
import type { WorkoutDay } from "../programTypes";

function input(over: Partial<PlanBuilderInput> = {}): PlanBuilderInput {
  return {
    primaryGoal: "strength",
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

const timesAWeek = (workouts: readonly WorkoutDay[], id: string) =>
  workouts.flatMap((d) => d.exercises).filter((e) => e.exerciseId === id)
    .length;

/** Each slot held for an injury whose lift isn't one of the curated swaps
 *  for the lift it replaced, as `original → lift`. */
const offTheList = (
  workouts: readonly WorkoutDay[],
  injuries: readonly string[]
) =>
  workouts
    .flatMap((d) => d.exercises)
    .filter(
      (ex) =>
        ex.swappedFrom !== undefined &&
        contraindicatedFor(ex.swappedFrom.exerciseId, injuries).length > 0 &&
        !(INJURY_SUBSTITUTIONS[ex.swappedFrom.exerciseId] ?? []).some(
          (sub) => sub.id === ex.exerciseId
        )
    )
    .map((ex) => `${ex.swappedFrom!.exerciseId} → ${ex.exerciseId}`);

describe("a sore back's swaps stand", () => {
  it("in a full gym: the squat keeps its swap, and the leg press stays at two days", () => {
    const workouts = workoutsFor({ injuries: ["lower_back"] });
    expect(offTheList(workouts, ["lower_back"])).toEqual([]);
    expect(timesAWeek(workouts, "leg-press")).toBeLessThanOrEqual(
      MAX_WEEKLY_LIFT_EXPOSURES
    );
  });

  it("at home with a barbell: the deadlift keeps its swap, and the hip thrust stays at two days", () => {
    const workouts = workoutsFor({
      primaryGoal: "hypertrophy",
      equipment: "home_gym",
      barbellAtHome: true,
      injuries: ["lower_back"],
    });
    expect(offTheList(workouts, ["lower_back"])).toEqual([]);
    expect(timesAWeek(workouts, "hip-thrust")).toBeLessThanOrEqual(
      MAX_WEEKLY_LIFT_EXPOSURES
    );
  });
});

describe("the gate still levels what isn't held for an injury", () => {
  it("a beginner's kit swap that the time fit left above their level", () => {
    // Six 30-minute days at home: the shoulder day's overhead press can't
    // take the dumbbell press its own accessory holds, so the kit swap gives
    // it an Arnold press; the time fit then drops that accessory, and the
    // gate brings the main lift down to the dumbbell press.
    const workouts = workoutsFor({
      liftDays: 6,
      sessionMinutes: 30,
      equipment: "home_gym",
    });
    expect(timesAWeek(workouts, "arnold-press")).toBe(0);
    expect(timesAWeek(workouts, "db-shoulder-press")).toBe(2);
  });
});

describe("every slot an injury holds keeps a lift from its curated list", () => {
  it("across each injury, level, focus and day count in a full gym", () => {
    const off: string[] = [];
    let plans = 0;
    for (const injury of ["knee", "shoulder", "lower_back", "wrist", "elbow"]) {
      for (const experience of ["beginner", "intermediate", "advanced"]) {
        for (const primaryGoal of ["strength", "hypertrophy", "general"]) {
          for (let liftDays = 2; liftDays <= 5; liftDays++) {
            const injuries = [injury];
            const workouts = workoutsFor({
              experience,
              primaryGoal,
              liftDays,
              injuries,
            } as Partial<PlanBuilderInput>);
            plans += 1;
            const missed = offTheList(workouts, injuries);
            if (missed.length > 0) {
              off.push(
                `${injury} ${experience} ${primaryGoal} ${liftDays}d: ${missed.join(", ")}`
              );
            }
          }
        }
      }
    }
    expect(plans).toBe(180);
    expect(off, off.slice(0, 8).join("\n")).toEqual([]);
  }, 30_000);
});

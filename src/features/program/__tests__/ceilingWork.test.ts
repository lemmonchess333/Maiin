/**
 * Lift12: the table is a ceiling for every muscle. The reconciler cuts sets
 * down to its floors and never takes a lift out, so a muscle fed by the
 * lifts that credit it as well stayed over: a beginner's six days of Get
 * stronger at home read 21 triceps and 21 biceps sets a week against a
 * ceiling of 9, every press and row counting toward them at 1:1 (ADR-0010).
 *
 * A new plan now lets a supporting lift of an over muscle's own go
 * (`accessoriesPastCeiling`) when the week, fitted and balanced again
 * without it, is the better one: that muscle comes down, no muscle ends
 * further over, every muscle keeps its two days and the muscle its floor.
 * End to end through `buildPlan`, as the L7 suite does for the hamstrings.
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

const input: PlanBuilderInput = {
  primaryGoal: "strength",
  nutritionPhase: "recomp",
  experience: "beginner",
  sessionMinutes: 60,
  bodyweightKg: 65,
  sex: "female",
  liftDays: 6,
  preferredSplit: "auto",
  runMode: "freeform",
  weeklyRunDays: 0,
  equipment: "home_gym",
  injuries: [],
  currentDate: "2026-03-09",
} as PlanBuilderInput;

const workouts = buildPlan(input).programState.workouts;
const band = (muscle: JudgementMuscle) =>
  judgementLandmark("strength", muscle, toExperience("beginner"));
const setsOf = (muscle: JudgementMuscle) =>
  weeklyVolumeByJudgementMuscle(workouts).find((v) => v.muscle === muscle)
    ?.sets ?? 0;

describe("a beginner's six days at home (Lift12)", () => {
  it("brings the arms down from more than twice their ceiling", () => {
    for (const muscle of ["Triceps", "Biceps"] as const) {
      expect(setsOf(muscle), muscle).toBeLessThanOrEqual(
        band(muscle).high * 1.25
      );
      expect(setsOf(muscle), muscle).toBeGreaterThanOrEqual(band(muscle).low);
    }
  });

  it("keeps every muscle it works on two days", () => {
    for (const [muscle, days] of daysPerMuscle(workouts)) {
      expect(days, muscle).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every day's main lift, and more than one lift a day", () => {
    for (const day of workouts) {
      expect(day.exercises[0].isAccessory, day.dayName).not.toBe(true);
      expect(day.exercises.length, day.dayName).toBeGreaterThanOrEqual(2);
    }
  });
});

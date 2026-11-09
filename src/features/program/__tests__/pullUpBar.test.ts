/**
 * "A pull-up bar" (Lift4 (11), "What do you have?"): at home, pull-ups,
 * chin-ups and the hanging leg raise need one. A home gym, a minimal setup
 * and no equipment ask; without a bar those lifts take their usual swaps,
 * and a home or minimal plan the person has keeps them until they answer
 * no (Pgm5). No equipment starts with no bar (`noEquipment.test.ts` has
 * its plans both ways).
 */
import { describe, it, expect } from "vitest";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { PULL_UP_BAR_EXERCISE_IDS } from "../matchTemplate";
import {
  hasPullUpBar,
  plansNoPull,
  pullUpBarWhenChosen,
  takesPullUpBar,
} from "../programLabels";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";

const answers = (
  equipment: PlanBuilderInput["equipment"],
  extra: Partial<PlanBuilderInput> = {}
) =>
  ({
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 80,
    sex: "male",
    liftDays: 4,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    injuries: [],
    equipment,
    currentDate: "2026-07-28",
    ...extra,
  }) as PlanBuilderInput;

const barLifts = (workouts: readonly WorkoutDay[]) =>
  workouts
    .flatMap((day) => day.exercises)
    .filter((ex) => PULL_UP_BAR_EXERCISE_IDS.has(ex.exerciseId))
    .map((ex) => ex.exerciseId);

const GOALS: PrimaryGoal[] = ["general", "hypertrophy", "strength"];

describe("who is asked, and what an answer starts as", () => {
  it("asks a home gym, a minimal setup and no equipment, not a full gym", () => {
    expect(takesPullUpBar("home_gym")).toBe(true);
    expect(takesPullUpBar("minimal")).toBe(true);
    expect(takesPullUpBar("no_equipment")).toBe(true);
    expect(takesPullUpBar("full_gym")).toBe(false);
  });

  it("starts a home gym on, Minimal and no equipment off, and reads no answer as an older plan's", () => {
    expect(pullUpBarWhenChosen("home_gym")).toBe(true);
    expect(pullUpBarWhenChosen("minimal")).toBe(false);
    expect(pullUpBarWhenChosen("no_equipment")).toBe(false);
    // An older plan, whose person was never asked, keeps its pull-ups.
    expect(hasPullUpBar("minimal", undefined)).toBe(true);
    expect(hasPullUpBar("home_gym", undefined)).toBe(true);
    expect(hasPullUpBar("minimal", false)).toBe(false);
    expect(hasPullUpBar("full_gym", undefined)).toBe(true);
    // No equipment has a bar only when the person said so.
    expect(hasPullUpBar("no_equipment", undefined)).toBe(false);
    expect(hasPullUpBar("no_equipment", false)).toBe(false);
    expect(hasPullUpBar("no_equipment", true)).toBe(true);
  });

  it("plans no pull with no equipment, unless a bar is there for someone past beginner", () => {
    expect(plansNoPull("no_equipment", undefined, "intermediate")).toBe(true);
    expect(plansNoPull("no_equipment", false, "advanced")).toBe(true);
    expect(plansNoPull("no_equipment", true, "intermediate")).toBe(false);
    expect(plansNoPull("no_equipment", true, "advanced")).toBe(false);
    // Pull-ups and chin-ups aren't a beginner's (`offerableTo`): a bar
    // gives a beginner nothing to pull with.
    expect(plansNoPull("no_equipment", true, "beginner")).toBe(true);
    expect(plansNoPull("no_equipment", true, undefined)).toBe(true);
    for (const equipment of ["full_gym", "home_gym", "minimal"])
      expect(plansNoPull(equipment, false, "beginner"), equipment).toBe(false);
  });
});

describe("a plan at home", () => {
  it("has no pull-up, chin-up or hanging leg raise without a bar", () => {
    for (const equipment of ["home_gym", "minimal"] as const)
      for (const primaryGoal of GOALS)
        for (const experience of ["intermediate", "advanced"] as const)
          for (const liftDays of [2, 3, 4, 5, 6]) {
            const { workouts } = buildPlan(
              answers(equipment, {
                primaryGoal,
                experience,
                liftDays,
                pullUpBar: false,
              })
            ).programState;
            expect(
              barLifts(workouts),
              `${equipment}/${primaryGoal}/${experience}/${liftDays}d`
            ).toEqual([]);
          }
  });

  it("still pulls without a bar: a row takes the pull-up's place", () => {
    for (const equipment of ["home_gym", "minimal"] as const) {
      const { workouts } = buildPlan(
        answers(equipment, { pullUpBar: false })
      ).programState;
      expect(
        workouts
          .flatMap((day) => day.exercises)
          .some((ex) =>
            ["horizontal_pull", "vertical_pull"].includes(ex.movementCategory)
          ),
        equipment
      ).toBe(true);
    }
  });

  it("gives them with a bar, as before", () => {
    for (const equipment of ["home_gym", "minimal"] as const) {
      const ask = buildPlan(answers(equipment, { pullUpBar: true }));
      const before = buildPlan(answers(equipment));
      expect(barLifts(ask.programState.workouts).length, equipment).toBe(
        barLifts(before.programState.workouts).length
      );
      expect(barLifts(ask.programState.workouts).length).toBeGreaterThan(0);
    }
  });

  it("keeps a Minimal plan's pull-ups until the person says no, and brings them back on yes", () => {
    const kept = buildPlan(answers("minimal"));
    const ids = (w: readonly WorkoutDay[]) =>
      w.map((d) => d.exercises.map((ex) => ex.exerciseId));
    expect(barLifts(kept.programState.workouts).length).toBeGreaterThan(0);
    const save = (from: typeof kept, pullUpBar?: boolean) =>
      buildPlan(
        answers("minimal", {
          ...(pullUpBar !== undefined ? { pullUpBar } : {}),
          existingState: from.programState,
          preserveHistory: true,
        })
      );
    // A save that doesn't answer changes nothing.
    expect(ids(save(kept).programState.workouts)).toEqual(
      ids(kept.programState.workouts)
    );
    const no = save(kept, false);
    expect(barLifts(no.programState.workouts)).toEqual([]);
    expect(no.profileUpdates.pullUpBar).toBe(false);
    // Yes brings back the lifts the answer swapped out. A hanging leg raise
    // that was itself the cable crunch's swap keeps the floor lift it went
    // to: a swap remembers the first lift, and the bar doesn't bring a cable.
    const yes = save(no, true);
    const hanging = (w: readonly WorkoutDay[]) =>
      barLifts(w).filter((id) => id !== "leg-raise");
    expect(hanging(yes.programState.workouts)).toEqual(
      hanging(kept.programState.workouts)
    );
    expect(hanging(kept.programState.workouts).length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { liftPlanFacts, liftPlanWeek } from "../liftWeekLabel";
import { planMoment } from "../postMoments";
import type {
  ActiveTrainingBlock,
  RunPlan,
  WorkoutDay,
} from "@/features/program/programTypes";

/**
 * A lift's place in a plan with a set length, for its post's "Week 4 of 12
 * done" and "Programme complete" (Soc15): a training block, or a race plan's
 * block while it runs. A plan that only repeats its cycle, or counts on
 * with no end, has no week N of M to finish.
 */

const today = "2026-09-06";
const day = (completed: boolean, skipped = false) =>
  ({ completed, skipped }) as WorkoutDay;
const state = {
  weekNumber: 2,
  currentPhase: "progression",
  primaryGoal: "strength" as const,
  workouts: [day(true), day(false), day(false)],
};
const block: ActiveTrainingBlock = {
  id: "test",
  owned: true,
  focus: "strength",
  pace: "full",
  durationWeeks: 8,
  // Today is in its second week.
  startDate: "2026-08-30",
  goalBefore: "general",
  weeklyLiftTarget: 3,
  anchorExerciseIds: [],
  why: "",
  createdAt: 1,
  schemaVersion: 1,
};
const racePlan = (currentWeek: number) =>
  ({
    mode: "race_prep",
    raceGoal: { distance: "half", targetDate: "2026-12-20" },
    currentWeek,
    totalWeeks: 16,
  }) as RunPlan;

/** The plan as a save leaves it: day `index` done. */
const doneAt = <T extends { workouts: WorkoutDay[] }>(s: T, index: number) => ({
  ...s,
  workouts: s.workouts.map((w, i) => (i === index ? day(true) : w)),
});

describe("liftPlanWeek", () => {
  it("counts a training block's week, which ends the plan", () => {
    expect(liftPlanWeek({ ...state, trainingBlock: block }, today)).toEqual({
      week: 2,
      weeks: 8,
      ends: true,
    });
  });

  it("counts a race block's week, after which the lifting carries on", () => {
    expect(liftPlanWeek({ ...state, runPlan: racePlan(6) }, today)).toEqual({
      week: 7,
      weeks: 16,
      ends: false,
    });
  });

  it("has no week of a set length for a cycle, a plain counter or no plan", () => {
    expect(liftPlanWeek(state, today)).toBeNull();
    expect(liftPlanWeek(null, today)).toBeNull();
    // A block that has not started, or has finished, counts no week.
    expect(
      liftPlanWeek({ ...state, trainingBlock: block }, "2026-08-29")
    ).toBeNull();
    expect(
      liftPlanWeek({ ...state, trainingBlock: block }, "2026-10-25")
    ).toBeNull();
  });
});

describe("liftPlanFacts", () => {
  const inBlock = { ...state, trainingBlock: block };

  it("finishes the week with the last lift still to do", () => {
    const before = {
      ...inBlock,
      workouts: [day(true), day(false, true), day(false)],
    };
    const facts = liftPlanFacts(before, doneAt(before, 2), today);
    expect(facts).toEqual({ week: 2, weeks: 8, ends: true, weekDone: true });
    expect(planMoment(facts)).toEqual({ kind: "planWeek", week: 2, weeks: 8 });
  });

  it("finishes nothing while another lift of the week is still to do", () => {
    const facts = liftPlanFacts(inBlock, doneAt(inBlock, 1), today);
    expect(facts?.weekDone).toBe(false);
    expect(planMoment(facts)).toBeNull();
  });

  it("finishes nothing for a lift saved into a week already done", () => {
    const done = { ...inBlock, workouts: [day(true), day(true), day(true)] };
    expect(liftPlanFacts(done, done, today)?.weekDone).toBe(false);
  });

  it("completes the programme with the block's last week", () => {
    const lastWeek = "2026-10-21";
    const before = { ...inBlock, workouts: [day(true), day(true), day(false)] };
    const facts = liftPlanFacts(before, doneAt(before, 2), lastWeek);
    expect(facts).toEqual({ week: 8, weeks: 8, ends: true, weekDone: true });
    expect(planMoment(facts)).toEqual({ kind: "planComplete" });
  });

  it("has no facts for a plan with no length", () => {
    expect(liftPlanFacts(state, doneAt(state, 1), today)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildTimeBudgetSession } from "../liftTimeBudget";
import {
  estimateSessionMinutes,
  draftScopeForVariant,
} from "../expressSession";
import { buildPlan } from "../planBuilder";
import { applySessionProgression } from "../sessionCompletion";

function programme() {
  return buildPlan({
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    liftDays: 4,
    preferredSplit: "upper_lower",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    currentDate: "2026-09-07",
    bodyweightKg: 80,
  }).programState;
}

describe("recurring lift time", () => {
  it.each([30, 45, 60, 75, 90, 120])(
    "prepares an immutable %s-minute execution with correct identities",
    (budget) => {
      const state = programme();
      const day = state.workouts[0];
      const original = structuredClone(day);
      const plan = buildTimeBudgetSession(day, budget);
      expect(day).toEqual(original);
      expect(plan.exercises[0]).toEqual(day.exercises[0]);
      expect(plan.estimatedMinutes).toBe(
        estimateSessionMinutes(plan.exercises)
      );
      for (const ex of day.exercises.filter((ex) => ex.isAccessory !== true))
        expect(
          plan.exercises.some((next) => next.instanceId === ex.instanceId)
        ).toBe(true);
      for (const [i, index] of plan.sourceIndexes.entries()) {
        expect(plan.exercises[i].instanceId).toBe(
          day.exercises[index].instanceId
        );
        expect(plan.exercises[i].weight).toBe(day.exercises[index].weight);
        expect(plan.exercises[i].sets).toBeLessThanOrEqual(
          day.exercises[index].sets
        );
      }
      expect(buildTimeBudgetSession(day, budget)).toEqual(plan);
    }
  );
  it("prices rest and setup and reports a protected main-lift overrun", () => {
    const day = programme().workouts[0];
    day.exercises = day.exercises
      .slice(0, 2)
      .map((ex) => ({ ...ex, isAccessory: false, sets: 6, restSeconds: 300 }));
    const plan = buildTimeBudgetSession(day, 30);
    expect(plan.exercises).toHaveLength(2);
    expect(plan.exercises[0].sets).toBe(6);
    expect(plan.exercises[1].sets).toBe(3);
    expect(plan.estimatedMinutes).toBeGreaterThan(30);
    expect(draftScopeForVariant(plan.variant)).not.toBe(
      draftScopeForVariant("full")
    );
  });
  it("holds progression for reduced working sets and keeps omitted exercise histories", () => {
    const state = programme();
    const day = state.workouts[0];
    const ex = day.exercises[0];
    const next = applySessionProgression(state, 0, {
      completionId: "budget",
      date: "2026-09-07",
      sessionVariant: "time_budget",
      prescription: {
        exercises: [{ ...ex, sets: 1 }],
        progressionBaseline: [ex],
      },
      setLogs: [
        [
          {
            reps: ex.reps + 2,
            weight: ex.weight,
            completed: true,
            type: "working",
          },
        ],
      ],
    });
    expect(next.workouts[0].exercises).toEqual(day.exercises);
  });
});

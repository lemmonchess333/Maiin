/**
 * The session a programme day runs as (`sessionDay.ts`). Train builds the
 * session from here, and the In progress strip's reader finds a draft's
 * session the same way, so these pin the two agreements that matter: a
 * variant runs the plan its builder makes, and the identity a draft is
 * filed under is the workout screen's (`computeDraftIdentity` over the
 * variant's scope, the week and the layout it actually runs).
 */
import { describe, expect, it } from "vitest";
import {
  programmeDraftIdentity,
  sessionDayContext,
  sessionDayFor,
  sessionPlanFor,
  usualLiftBudget,
} from "../sessionDay";
import { draftScopeForVariant } from "../expressSession";
import { buildTimeBudgetSession } from "../liftTimeBudget";
import { computeDraftIdentity, draftLayout } from "@/hooks/useWorkoutDraft";
import type { ProgramState, WorkoutDay } from "../programTypes";

const DAY = {
  dayName: "Push — Chest Focus",
  dayType: "push",
  completed: false,
  exercises: [
    { exerciseId: "bench-press", name: "Bench Press", sets: 4, reps: 6 },
    {
      exerciseId: "overhead-press",
      name: "Overhead Press",
      sets: 3,
      reps: 8,
    },
    {
      exerciseId: "lateral-raise",
      name: "Lateral Raise",
      sets: 4,
      reps: 12,
      isAccessory: true,
    },
    {
      exerciseId: "triceps-pushdown",
      name: "Triceps Pushdown",
      sets: 4,
      reps: 12,
      isAccessory: true,
    },
  ],
} as unknown as WorkoutDay;

const STATE = {
  weekNumber: 4,
  settings: { autoProgression: true, smallPlates: false },
} as unknown as ProgramState;

describe("usualLiftBudget", () => {
  it("trims to the person's usual time only on a plan not built to fit it", () => {
    expect(usualLiftBudget({ sessionMinutes: undefined }, 45)).toBe(45);
    expect(usualLiftBudget({ sessionMinutes: 45 }, 45)).toBeNull();
    expect(usualLiftBudget({ sessionMinutes: undefined }, 7)).toBeNull();
    expect(usualLiftBudget(null, null)).toBeNull();
  });
});

describe("sessionPlanFor", () => {
  const context = sessionDayContext(STATE, { liftTimeBudgetMinutes: 30 });

  it("runs the full day as stored", () => {
    expect(sessionPlanFor(DAY, "full", context)).toBeNull();
    expect(sessionDayFor(DAY, "full", context)).toBe(DAY);
  });

  it("trims a time-budget start to the usual time", () => {
    expect(sessionPlanFor(DAY, "time_budget", context)?.exercises).toEqual(
      buildTimeBudgetSession(DAY, 30, context.rest).exercises
    );
  });
});

describe("programmeDraftIdentity", () => {
  const context = sessionDayContext(STATE, { liftTimeBudgetMinutes: 30 });

  it("is the identity the workout screen gives the session it opens", () => {
    for (const variant of [
      "full",
      "time_budget",
      "easier_today",
      "express45",
      "express30",
    ] as const) {
      const day = sessionDayFor(DAY, variant, context);
      expect(programmeDraftIdentity(DAY, 2, 4, variant, context)).toBe(
        computeDraftIdentity({
          scope: draftScopeForVariant(variant),
          epoch: 4,
          dayIndex: 2,
          dayName: day.dayName,
          layout: draftLayout(day.exercises),
        })
      );
    }
  });

  it("tells the ways a day can be started apart, and the weeks", () => {
    const full = programmeDraftIdentity(DAY, 0, 4, "full", context);
    expect(programmeDraftIdentity(DAY, 0, 4, "easier_today", context)).not.toBe(
      full
    );
    expect(programmeDraftIdentity(DAY, 0, 5, "full", context)).not.toBe(full);
  });
});

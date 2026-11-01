/**
 * The starter goal (Run9's reopening) in the engine: how a starter plan
 * moves week to week (`nextRunWeek`, `rollRunWeeks`), what the rollover
 * anchor and the loader ask of it, how its week is built from a given day
 * (`starterWeekFrom`), a change of layout through `buildPlan`, and where a
 * race plan's new-runner weeks start once it is over.
 *
 * Pure functions of the plan, the profile and the days of the saved runs:
 * the dates are fixed, and the clock is set only where a function reads it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  type ProgramState,
} from "../programTypes";
import { nextRunWeek, rollRunWeeks } from "../weekRollover";
import {
  isStarterPlanRunning,
  runWeekKeyOf,
  starterWeekNeedsBuilding,
  weekRolloverAnchor,
} from "../programMaintenance";
import { starterRunPlan, starterWeekFrom } from "../starterWeek";
import { scheduleStarterWeek } from "../runScheduler";
import { starterNewRunnerUntil, weekKeyAfter } from "../starterPlan";
import { profileNewRunnerUntil } from "../newRunner";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";

/** A Monday. The weeks after it cross Auckland's change to summer time. */
const W0 = "2026-09-07";
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));
const week = (n: number) => weekKeyAfter(W0, n);

afterEach(() => {
  vi.useRealTimers();
});

/** Runs `run` with the clock at noon on `day`. */
function onDay<T>(day: string, run: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(parseLocalDate(day).getTime() + 12 * 3600 * 1000);
  try {
    return run();
  } finally {
    vi.useRealTimers();
  }
}

/** Lifts Monday, Wednesday and Friday; runs Tuesday, Thursday, Saturday. */
const SCHEDULE: ScheduleDay[] = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "run" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

const profile = {
  uid: "u",
  runMode: "starter",
  starterGoal: { startedOn: W0 },
  weekSchedule: SCHEDULE,
  experience: "beginner",
} as unknown as UserProfile;

/** A plan at `stage` in the week starting `weekKey`, no lifts to move. */
function starterState(stage: number, weekKey: string): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "full_body",
    workouts: [],
    fatigueScore: 0,
    updatedAt: 0,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
    liftWeekKey: weekKey,
    runDays: scheduleStarterWeek({
      weekSchedule: SCHEDULE,
      weekStart: weekKey,
      stage,
    }),
    runPlan: starterRunPlan(stage, weekKey),
  } as unknown as ProgramState;
}

/** Tuesday and Thursday of the week starting `weekKey`. */
const twoRuns = (weekKey: string) => [shift(weekKey, 1), shift(weekKey, 3)];

describe("a starter week moving on", () => {
  it("moves the stage on once two runs were saved in the week", () => {
    const next = nextRunWeek(
      starterState(3, W0),
      { weekStart: week(1), date: week(1) },
      profile,
      "none",
      twoRuns(W0)
    );
    expect(next.runPlan).toEqual({
      mode: "starter",
      stage: 4,
      stageWeekKey: week(1),
    });
    expect(next.runDays?.map((d) => [d.date, d.templateId])).toEqual([
      [shift(week(1), 1), "run_walk_4"],
      [shift(week(1), 3), "run_walk_4"],
      [shift(week(1), 5), "run_walk_4"],
    ]);
    expect(next.raceBlock).toBeNull();
    expect(next.starterFinishedOn).toBeUndefined();
  });

  it("repeats the stage after a week with one run", () => {
    const next = nextRunWeek(
      starterState(3, W0),
      { weekStart: week(1), date: week(1) },
      profile,
      "none",
      [shift(W0, 2)]
    );
    expect(next.runPlan?.stage).toBe(3);
    expect(next.runPlan?.stageWeekKey).toBe(week(1));
    expect(next.runDays?.every((d) => d.templateId === "run_walk_3")).toBe(
      true
    );
  });

  it("holds the stage when the runs could not be read", () => {
    for (const unread of [null, undefined]) {
      const next = nextRunWeek(
        starterState(6, W0),
        { weekStart: week(1), date: week(1) },
        profile,
        "none",
        unread
      );
      expect(next.runPlan).toEqual(starterRunPlan(6, week(1)));
    }
  });

  it("finishes the goal on the last stage's done week, on the day it was done", () => {
    const next = nextRunWeek(
      starterState(9, W0),
      { weekStart: week(1), date: week(1) },
      profile,
      "none",
      // A run outside the plan, on Sunday, counts as any other.
      [shift(W0, 3), shift(W0, 1), shift(W0, 6)]
    );
    expect(next.runPlan).toBeUndefined();
    expect(next.runDays).toEqual([]);
    expect(next.starterFinishedOn).toBe(shift(W0, 3));
  });

  it("is left to the race plan's rules for a profile no longer on it", () => {
    // A starter plan under free running is not rolled as a starter's.
    const next = nextRunWeek(
      starterState(4, W0),
      { weekStart: week(1), date: week(1) },
      { ...profile, runMode: "freeform" } as UserProfile,
      "none",
      twoRuns(W0)
    );
    expect(next.runPlan).toBeUndefined();
    expect(next.runDays).toEqual([]);
  });
});

describe("rolling a starter plan over", () => {
  it("rolls one week on the Monday after", () => {
    const today = week(1);
    const rolled = onDay(today, () =>
      rollRunWeeks(starterState(2, W0), profile, today, "none", twoRuns(W0))
    );
    expect(rolled.weeks).toBe(1);
    expect(rolled.state.runPlan).toEqual(starterRunPlan(3, week(1)));
    expect(rolled.state.liftWeekKey).toBe(week(1));
    expect(rolled.starterFinishedOn).toBeUndefined();
  });

  it("weighs each week of a gap, stepping back one as it reaches three weeks", () => {
    // Runs in the week before W0, then none for four weeks.
    const before = [shift(W0, -6), shift(W0, -4)];
    const today = week(4);
    const rolled = onDay(today, () =>
      rollRunWeeks(starterState(5, W0), profile, today, "none", before)
    );
    expect(rolled.weeks).toBe(4);
    expect(rolled.state.runPlan).toEqual(starterRunPlan(4, week(4)));
    expect(rolled.state.runDays?.[0]?.templateId).toBe("run_walk_4");
  });

  it("starts on next week's runs when none of this week's are left", () => {
    // Back on a Sunday: Tuesday's, Thursday's and Saturday's are gone.
    const today = shift(week(1), 6);
    const rolled = onDay(today, () =>
      rollRunWeeks(starterState(2, W0), profile, today, "none", twoRuns(W0))
    );
    expect(rolled.weeks).toBe(1);
    expect(rolled.state.runPlan).toEqual(starterRunPlan(3, week(2)));
    expect(rolled.state.runDays?.map((d) => d.date)).toEqual([
      shift(week(2), 1),
      shift(week(2), 3),
      shift(week(2), 5),
    ]);
  });

  it("plans the week reached from today", () => {
    // Back on a Wednesday: Tuesday's run is gone.
    const today = shift(week(1), 2);
    const rolled = onDay(today, () =>
      rollRunWeeks(starterState(2, W0), profile, today, "none", twoRuns(W0))
    );
    expect(rolled.state.runDays?.map((d) => d.date)).toEqual([
      shift(week(1), 3),
      shift(week(1), 5),
    ]);
  });

  it("reports the finish, and stops rolling the runs once free running", () => {
    const today = week(3);
    const rolled = onDay(today, () =>
      rollRunWeeks(starterState(9, W0), profile, today, "none", twoRuns(W0))
    );
    // One week moved and the goal finished in it; the lifts carry the
    // calendar from here, once the profile is free running.
    expect(rolled.weeks).toBe(1);
    expect(rolled.starterFinishedOn).toBe(shift(W0, 3));
    expect(rolled.state.runPlan).toBeUndefined();
    expect(
      weekRolloverAnchor(rolled.state, {
        ...profile,
        runMode: "freeform",
      } as UserProfile)
    ).toEqual({ side: "lift", weekKey: week(1) });
  });

  it("does nothing in the plan's own week", () => {
    const rolled = onDay(shift(W0, 3), () =>
      rollRunWeeks(starterState(2, W0), profile, shift(W0, 3), "none", [])
    );
    expect(rolled.weeks).toBe(0);
  });
});

describe("what the engine asks of a starter plan", () => {
  it("rolls a starter plan from its runs' week, even with no run day", () => {
    const state = starterState(4, W0);
    expect(weekRolloverAnchor(state, profile)).toEqual({
      side: "run",
      weekKey: W0,
    });
    const noRunDays = { ...state, runDays: [] };
    expect(runWeekKeyOf(noRunDays)).toBe(W0);
    expect(weekRolloverAnchor(noRunDays, profile)).toEqual({
      side: "run",
      weekKey: W0,
    });
  });

  it("is a starter's only for a profile on the starter goal", () => {
    const state = starterState(4, W0);
    expect(isStarterPlanRunning(state, profile)).toBe(true);
    expect(
      isStarterPlanRunning(state, { runMode: "freeform" } as UserProfile)
    ).toBe(false);
    expect(
      weekRolloverAnchor(state, { runMode: "freeform" } as UserProfile)
    ).toEqual({ side: "lift", weekKey: W0 });
  });

  it("has the loader build a goal just begun, and leaves a running one", () => {
    expect(starterWeekNeedsBuilding({}, profile)).toBe(true);
    expect(
      starterWeekNeedsBuilding(
        { runPlan: { mode: "race_prep" } } as ProgramState,
        profile
      )
    ).toBe(true);
    expect(starterWeekNeedsBuilding(starterState(2, W0), profile)).toBe(false);
    expect(
      starterWeekNeedsBuilding({}, { runMode: "freeform" } as UserProfile)
    ).toBe(false);
  });
});

describe("starterWeekFrom", () => {
  it("plans the stage's runs from today, keeping the week's days already gone", () => {
    const prior = scheduleStarterWeek({
      weekSchedule: SCHEDULE,
      weekStart: W0,
      stage: 2,
    });
    const built = starterWeekFrom({
      weekSchedule: SCHEDULE,
      stage: 2,
      today: shift(W0, 2),
      prior,
    });
    expect(built.runPlan).toEqual(starterRunPlan(2, W0));
    expect(built.runDays.map((d) => d.date)).toEqual([
      shift(W0, 1),
      shift(W0, 3),
      shift(W0, 5),
    ]);
    // Tuesday's day is the one the plan had, id and all.
    expect(built.runDays[0]).toBe(prior[0]);
  });

  it("starts on next week's runs when none of the week's are left", () => {
    const built = starterWeekFrom({
      weekSchedule: SCHEDULE,
      stage: 1,
      today: shift(W0, 6),
    });
    expect(built.runPlan).toEqual(starterRunPlan(1, week(1)));
    expect(built.runDays.map((d) => d.weekKey)).toEqual([
      week(1),
      week(1),
      week(1),
    ]);
  });

  it("holds the plan's week with no run day in the schedule at all", () => {
    const built = starterWeekFrom({
      weekSchedule: SCHEDULE.map((d) => ({ ...d, type: "lift" as const })),
      stage: 3,
      today: W0,
    });
    expect(built.runDays).toEqual([]);
    expect(built.runPlan.stage).toBe(3);
  });
});

describe("a change of layout on a starter plan (buildPlan)", () => {
  const input = (overrides: Partial<PlanBuilderInput>): PlanBuilderInput => ({
    primaryGoal: "general",
    nutritionPhase: "recomp",
    experience: "beginner",
    liftDays: 3,
    preferredSplit: "full_body",
    runMode: "starter",
    weeklyRunDays: 3,
    equipment: "full_gym",
    injuries: [],
    weekSchedule: SCHEDULE,
    currentDate: shift(W0, 1),
    ...overrides,
  });

  it("keeps the stage and lays the week on the run days from today", () => {
    const existing = starterState(5, W0);
    const plan = buildPlan(
      input({ existingState: existing, preserveHistory: true })
    );
    expect(plan.programState.runPlan).toEqual(starterRunPlan(5, W0));
    expect(
      plan.programState.runDays?.map((d) => [d.date, d.templateId])
    ).toEqual([
      [shift(W0, 1), "run_walk_5"],
      [shift(W0, 3), "run_walk_5"],
      [shift(W0, 5), "run_walk_5"],
    ]);
    expect(plan.profileUpdates.runMode).toBe("starter");
  });

  it("begins at the first stage without a starter plan", () => {
    const plan = buildPlan(input({}));
    expect(plan.programState.runPlan).toEqual(starterRunPlan(1, W0));
  });
});

describe("a race plan's new-runner weeks after a starter goal", () => {
  it("build on from 30 minutes once the goal is finished", () => {
    const finishedOn = shift(W0, 3);
    expect(
      profileNewRunnerUntil({
        runFrequency: "new",
        starterGoal: { finishedOn },
      })
    ).toBe(starterNewRunnerUntil(9, W0));
  });

  it("go on from the stage reached when a race took its place", () => {
    expect(
      profileNewRunnerUntil({
        starterGoal: { endedOn: shift(W0, 4), stage: 4 },
      })
    ).toBe(starterNewRunnerUntil(4, W0));
  });

  it("count from setup while the goal runs, as before", () => {
    // A Firestore timestamp, as the server stamps it.
    const at = parseLocalDate(W0).getTime() + 9 * 3600 * 1000;
    const setup = {
      runFrequency: "new",
      onboardingCompletedAt: { toMillis: () => at },
    };
    expect(
      profileNewRunnerUntil({
        ...setup,
        starterGoal: { startedOn: W0 },
      } as never)
    ).toBe(profileNewRunnerUntil(setup));
    expect(profileNewRunnerUntil(setup)).toBe(shift(W0, 42));
  });
});

// The week keys these tests count in are Mondays, as the app's are.
it("counts in Monday weeks", () => {
  expect(localWeekKey(parseLocalDate(W0))).toBe(W0);
});

/**
 * The plan's rest days, which keep the streak (App1 Q32, 13 November 2026).
 *
 * Read as Home reads a day: the week schedule for the lifts, the plan's
 * dated run days for the runs, and a race's last days with no lifting. A
 * person with no plan has none.
 */
import { describe, expect, it } from "vitest";
import type { ProgramState } from "@/features/program/programTypes";
import {
  isPlannedRestDay,
  keptThroughAfter,
  planHoldsSessions,
  plannedRestDays,
  type StreakPlan,
} from "../restDays";

// Wednesday 11 November 2026. Its week runs Monday 9 to Sunday 15.
const TODAY = "2026-11-11";

type Day = "rest" | "lift" | "run" | "both";
/** A week schedule from Sunday (0) to Saturday (6). */
const week = (...types: Day[]) => types.map((type, day) => ({ day, type }));

/** Lifts on Monday, Wednesday and Friday. */
const THREE_DAY_LIFTER: StreakPlan = {
  profile: {
    weekSchedule: week("rest", "lift", "rest", "lift", "rest", "lift", "rest"),
  },
  startKey: "2026-09-01",
  programState: null,
};

const runDay = (date: string, dayIndex: number) => ({
  id: `run-${date}`,
  date,
  weekKey: "2026-11-09",
  dayIndex,
  templateId: "easy_run",
  type: "easy",
  status: "planned" as const,
});

/** Runs on Tuesday, Thursday, Saturday and Sunday; a 10K on Sunday 15
 *  November, and its taper week holds only Tuesday's run and the race. */
const TAPERING_RUNNER: StreakPlan = {
  profile: {
    weekSchedule: week("run", "rest", "run", "rest", "run", "rest", "run"),
  },
  startKey: "2026-09-01",
  programState: {
    runDays: [runDay("2026-11-10", 2), runDay("2026-11-15", 0)],
    runPlan: {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: "2026-11-15" },
    },
  } as unknown as ProgramState,
};

describe("the plan's rest days", () => {
  it("are the days a three-day lifter's week holds no lift", () => {
    expect([
      ...plannedRestDays(THREE_DAY_LIFTER, "2026-11-09", "2026-11-15", TODAY),
    ]).toEqual(["2026-11-10", "2026-11-12", "2026-11-14", "2026-11-15"]);
  });

  it("follow a taper week's runs, where the plan has written them", () => {
    // This week: Thursday's and Saturday's runs are not in the taper.
    expect(isPlannedRestDay("2026-11-12", TAPERING_RUNNER, TODAY)).toBe(true);
    expect(isPlannedRestDay("2026-11-14", TAPERING_RUNNER, TODAY)).toBe(true);
    expect(isPlannedRestDay("2026-11-10", TAPERING_RUNNER, TODAY)).toBe(false);
    // Race day is a run.
    expect(isPlannedRestDay("2026-11-15", TAPERING_RUNNER, TODAY)).toBe(false);
    // Last week is read from the pattern: Thursday was a run day then.
    expect(isPlannedRestDay("2026-11-05", TAPERING_RUNNER, TODAY)).toBe(false);
    expect(isPlannedRestDay("2026-11-02", TAPERING_RUNNER, TODAY)).toBe(true);
  });

  it("hold no lifting in a race's last two days", () => {
    // A hybrid racer who lifts on Fridays: Friday 13 is two days out.
    const hybrid: StreakPlan = {
      ...TAPERING_RUNNER,
      profile: {
        weekSchedule: week("run", "lift", "run", "rest", "run", "lift", "run"),
      },
    };
    expect(isPlannedRestDay("2026-11-13", hybrid, TODAY)).toBe(true);
    // Last Friday's lift was a lift.
    expect(isPlannedRestDay("2026-11-06", hybrid, TODAY)).toBe(false);
    // Monday's lift, six days out, stands.
    expect(isPlannedRestDay("2026-11-09", hybrid, TODAY)).toBe(false);
  });

  it("start on the day the account began", () => {
    const joined: StreakPlan = { ...THREE_DAY_LIFTER, startKey: "2026-11-11" };
    expect(isPlannedRestDay("2026-11-10", joined, TODAY)).toBe(false);
    expect(isPlannedRestDay("2026-11-12", joined, TODAY)).toBe(true);
  });

  it("are none for a person with no plan", () => {
    const noProfile: StreakPlan = {
      profile: null,
      startKey: null,
      programState: null,
    };
    // Food only, or running freely with no days set: nothing planned.
    const nothingPlanned: StreakPlan = {
      profile: { weekSchedule: week(...Array<Day>(7).fill("rest")) },
      startKey: null,
      programState: { runDays: [] } as unknown as ProgramState,
    };
    for (const plan of [noProfile, nothingPlanned]) {
      expect(planHoldsSessions(plan)).toBe(false);
      expect(
        plannedRestDays(plan, "2026-11-02", "2026-11-15", TODAY).size
      ).toBe(0);
    }
    expect(planHoldsSessions(THREE_DAY_LIFTER)).toBe(true);
  });
});

describe("the day a streak is kept through", () => {
  it("runs on over the rest days straight after the day it ends", () => {
    // Monday's lift keeps it through Tuesday; Friday's through the weekend.
    expect(keptThroughAfter("2026-11-09", THREE_DAY_LIFTER, TODAY)).toBe(
      "2026-11-10"
    );
    expect(keptThroughAfter("2026-11-13", THREE_DAY_LIFTER, TODAY)).toBe(
      "2026-11-15"
    );
    // The taper: Tuesday's run keeps it to Saturday, the eve of the race.
    expect(keptThroughAfter("2026-11-10", TAPERING_RUNNER, TODAY)).toBe(
      "2026-11-14"
    );
  });

  it("is the day itself with no plan", () => {
    expect(
      keptThroughAfter(
        "2026-11-09",
        { profile: null, startKey: null, programState: null },
        TODAY
      )
    ).toBe("2026-11-09");
  });
});

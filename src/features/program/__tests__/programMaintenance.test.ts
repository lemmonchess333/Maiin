/**
 * The upkeep questions the engine acts on and Home's snapshot asks before
 * loading it (programMaintenance.ts). Pure, so today is passed in and these
 * dates are fixed; nothing here reads the clock.
 */
import { describe, it, expect } from "vitest";
import { generateSchedule } from "@/lib/scheduleUtils";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState, ScheduledRunDay } from "../programTypes";
import {
  raceWeekNeedsBuilding,
  weekRolloverAnchor,
} from "../programMaintenance";

/** A Wednesday; its week starts on Monday 5 October. */
const TODAY = "2026-10-07";
const THIS_WEEK = "2026-10-05";
const LAST_WEEK = "2026-09-28";
/** Eight weeks out: far from race week. */
const RACE = { distance: "10k" as const, targetDate: "2026-12-06" };

function runDay(weekKey: string, templateId: string): ScheduledRunDay {
  return {
    id: `rd-${weekKey}-${templateId}`,
    weekKey,
    date: TODAY,
    dayIndex: 3,
    templateId,
    status: "planned",
  } as unknown as ScheduledRunDay;
}

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    runMode: "race_prep",
    raceGoal: RACE,
    weekSchedule: generateSchedule(2, 3),
    weeklyRunDaysTarget: 3,
    ...over,
  } as unknown as UserProfile;
}

describe("weekRolloverAnchor", () => {
  it("rolls a plan with runs over from its runs' week", () => {
    expect(
      weekRolloverAnchor(
        { runDays: [runDay(LAST_WEEK, "easy_30")], liftWeekKey: THIS_WEEK },
        profile()
      )
    ).toEqual({ side: "run", weekKey: LAST_WEEK });
  });

  it("leaves a free runner's left-over runs out of it", () => {
    // Free running plans no runs; the lifts own the week.
    expect(
      weekRolloverAnchor(
        { runDays: [runDay(LAST_WEEK, "easy_30")], liftWeekKey: THIS_WEEK },
        profile({ runMode: "freeform" })
      )
    ).toEqual({ side: "lift", weekKey: THIS_WEEK });
  });

  it("rolls a plan without runs over from its lifts' week", () => {
    expect(
      weekRolloverAnchor({ runDays: [], liftWeekKey: LAST_WEEK }, profile())
    ).toEqual({ side: "lift", weekKey: LAST_WEEK });
  });

  it("has nothing to roll over from before the lift week is written", () => {
    expect(weekRolloverAnchor({}, profile())).toBeNull();
  });
});

describe("raceWeekNeedsBuilding", () => {
  const raceThisWeek: Pick<ProgramState, "runDays" | "runPlan"> = {
    // A race in a week eight weeks before the race: the stored week
    // disagrees with the plan.
    runDays: [runDay(THIS_WEEK, "10k_race")],
  };

  it("builds a race plan's first week", () => {
    expect(raceWeekNeedsBuilding({}, profile(), TODAY)).toBe(true);
  });

  it("rebuilds this week when its runs no longer match the race", () => {
    expect(raceWeekNeedsBuilding(raceThisWeek, profile(), TODAY)).toBe(true);
  });

  it("leaves a week that matches alone", () => {
    expect(
      raceWeekNeedsBuilding(
        { runDays: [runDay(THIS_WEEK, "easy_30")] },
        profile(),
        TODAY
      )
    ).toBe(false);
  });

  it("leaves recovery alone", () => {
    expect(
      raceWeekNeedsBuilding(
        {
          ...raceThisWeek,
          runPlan: {
            phase: "recovery",
            recoveryEndDate: "2026-10-20",
          } as ProgramState["runPlan"],
        },
        profile(),
        TODAY
      )
    ).toBe(false);
  });

  it("leaves a race that has passed alone", () => {
    // The race was yesterday, in this same week, and the stored week has
    // no race in it. The elapsed-race paths own this, not a rebuild.
    expect(
      raceWeekNeedsBuilding(
        { runDays: [runDay(THIS_WEEK, "easy_30")] },
        profile({ raceGoal: { distance: "10k", targetDate: "2026-10-06" } }),
        TODAY
      )
    ).toBe(false);
  });

  it("leaves last week's runs to the rollover", () => {
    expect(
      raceWeekNeedsBuilding(
        { runDays: [runDay(LAST_WEEK, "10k_race")] },
        profile(),
        TODAY
      )
    ).toBe(false);
  });

  it("asks nothing of a plan without a race", () => {
    expect(
      raceWeekNeedsBuilding({}, profile({ runMode: "freeform" }), TODAY)
    ).toBe(false);
    expect(
      raceWeekNeedsBuilding({}, profile({ raceGoal: undefined }), TODAY)
    ).toBe(false);
  });
});

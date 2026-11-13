import { describe, expect, it } from "vitest";
import { raceLongRunCheck } from "../raceLongRunCheck";
import type { ProgramState } from "../programTypes";
import type { DatedRun } from "../layoffDetection";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/* Run24 (11), deep dive D14: the repo's owner-marathon trace missed its
   long runs for four weeks while doing most of its other runs; the weekly
   fell-behind check counts runs, so nothing said the marathon had gone out
   of reach. This check reads it from the runs. */
const TODAY = "2026-11-16"; // a Monday
const day = (offset: number) =>
  localDateString(addLocalDays(parseLocalDate(TODAY), offset));
const marathon = (weeksOut: number) => ({
  runMode: "race_prep" as const,
  raceGoal: {
    distance: "marathon" as const,
    targetDate: day(weeksOut * 7 + 6),
  },
});
const plan = (currentWeek: number) =>
  ({
    runPlan: { mode: "race_prep", totalWeeks: 20, currentWeek },
  }) as unknown as ProgramState;
const run = (offset: number, km: number): DatedRun => ({
  date: day(offset),
  distance: km * 1000,
  duration: km * 400,
});
/** Four 30-minute runs a week for four weeks, and no long run. */
const noLongRuns = Array.from({ length: 16 }, (_, i) => run(-2 - i * 1.5, 4));

describe("the weekly race check from the long runs done", () => {
  it("says so when the reach is under half the race", () => {
    // Seven weeks out: four build weeks before the marathon's three-week
    // taper, so 4 km builds to 12, under the marathon's 21.
    const check = raceLongRunCheck({
      profile: marathon(7),
      programState: plan(12),
      recentRuns: noLongRuns,
      today: TODAY,
    });
    expect(check).toEqual({
      longestKm: 4,
      reachKm: 12,
      raceKm: 42.2,
      weekKey: TODAY,
    });
  });

  it("is quiet while the long runs keep up", () => {
    const withLong = [...noLongRuns, run(-6, 16)];
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12),
        recentRuns: withLong,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("is quiet with the weeks left to build", () => {
    expect(
      raceLongRunCheck({
        profile: marathon(12),
        programState: plan(6),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("leaves a plan's first two weeks to setup's words", () => {
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(1),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("leaves a runner with no run in four weeks to the run return", () => {
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12),
        recentRuns: [run(-35, 20)],
        today: TODAY,
      })
    ).toBeNull();
  });

  it("says nothing without a race plan, or before the runs are read", () => {
    expect(
      raceLongRunCheck({
        profile: { runMode: "freeform", raceGoal: null },
        programState: plan(12),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12),
        recentRuns: null,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("asks a 5K's reach of half of 5 km", () => {
    const fiveK = (km: number) =>
      raceLongRunCheck({
        profile: {
          runMode: "race_prep",
          raceGoal: { distance: "5k", targetDate: day(13) },
        },
        programState: plan(6),
        recentRuns: [run(-3, km)],
        today: TODAY,
      });
    expect(fiveK(3)).toBeNull();
    expect(fiveK(2)).toMatchObject({ longestKm: 2, raceKm: 5 });
  });
});

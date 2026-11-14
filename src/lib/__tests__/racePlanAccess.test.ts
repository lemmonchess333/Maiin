import { describe, it, expect } from "vitest";
import {
  lockedPlanRunStarts,
  racePlanFreeWeekToRecord,
  racePlanLocked,
} from "../racePlanAccess";

const marathonWeek = (currentWeek: number, extra = {}) => ({
  mode: "race_prep",
  currentWeek,
  raceGoal: { distance: "marathon" },
  ...extra,
});

describe("racePlanLocked (whole-app grill Q85)", () => {
  it("a free half or full marathon plan is free in week 1, Pro from week 2", () => {
    expect(racePlanLocked({ isPro: false, runPlan: marathonWeek(0) })).toBe(
      false
    );
    expect(racePlanLocked({ isPro: false, runPlan: marathonWeek(1) })).toBe(
      true
    );
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: marathonWeek(5),
        raceDistance: "half",
      })
    ).toBe(true);
  });

  it("Pro and trials are never locked", () => {
    expect(racePlanLocked({ isPro: true, runPlan: marathonWeek(5) })).toBe(
      false
    );
  });

  it("5K and 10K plans, the starter and general training stay free", () => {
    for (const distance of ["5k", "10k"]) {
      expect(
        racePlanLocked({
          isPro: false,
          runPlan: marathonWeek(6),
          raceDistance: distance,
        })
      ).toBe(false);
    }
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: { mode: "starter", currentWeek: 4 },
      })
    ).toBe(false);
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: { mode: "structured", currentWeek: 4 },
      })
    ).toBe(false);
    expect(racePlanLocked({ isPro: false, runPlan: null })).toBe(false);
  });

  it("the recovery weeks after the race stay free", () => {
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: marathonWeek(16, { phase: "recovery" }),
      })
    ).toBe(false);
  });

  it("the profile's distance wins over the plan's copy", () => {
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: marathonWeek(3),
        raceDistance: "10k",
      })
    ).toBe(false);
  });

  it("the race itself still starts on a locked plan", () => {
    expect(lockedPlanRunStarts("race")).toBe(true);
    expect(lockedPlanRunStarts("long")).toBe(false);
    expect(lockedPlanRunStarts(null)).toBe(false);
  });
});

describe("the free week is once per account (Q85's gap)", () => {
  it("a first plan: its first week is free, and passing it is the moment to record", () => {
    const first = { isPro: false, runPlan: marathonWeek(0) };
    expect(racePlanLocked(first)).toBe(false);
    expect(racePlanFreeWeekToRecord(first)).toBe(false);
    const second = { isPro: false, runPlan: marathonWeek(1) };
    expect(racePlanLocked(second)).toBe(true);
    expect(racePlanFreeWeekToRecord(second)).toBe(true);
    // Recorded, nothing more to record.
    expect(racePlanFreeWeekToRecord({ ...second, freeWeekUsed: true })).toBe(
      false
    );
  });

  it("a later plan after the free week was used is Pro from its first week, lead-in days too", () => {
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: marathonWeek(0),
        freeWeekUsed: true,
      })
    ).toBe(true);
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: marathonWeek(0, { leadInWeek: "2026-11-09" }),
        raceDistance: "half",
        freeWeekUsed: true,
      })
    ).toBe(true);
  });

  it("a later plan before the free week was used still has it", () => {
    // A new race goal in the first week: nothing was recorded.
    const input = {
      isPro: false,
      runPlan: marathonWeek(0),
      freeWeekUsed: false,
    };
    expect(racePlanLocked(input)).toBe(false);
    expect(racePlanFreeWeekToRecord(input)).toBe(false);
  });

  it("race day still starts and recovery stays free after the free week was used", () => {
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: marathonWeek(0),
        freeWeekUsed: true,
      })
    ).toBe(true);
    expect(lockedPlanRunStarts("race")).toBe(true);
    const recovery = {
      isPro: false,
      runPlan: marathonWeek(12, { phase: "recovery" }),
      freeWeekUsed: true,
    };
    expect(racePlanLocked(recovery)).toBe(false);
    expect(racePlanFreeWeekToRecord(recovery)).toBe(false);
  });

  it("5K and 10K plans, the starter and general training stay free after it", () => {
    for (const distance of ["5k", "10k"]) {
      expect(
        racePlanLocked({
          isPro: false,
          runPlan: marathonWeek(0),
          raceDistance: distance,
          freeWeekUsed: true,
        })
      ).toBe(false);
    }
    expect(
      racePlanLocked({
        isPro: false,
        runPlan: { mode: "structured", currentWeek: 0 },
        freeWeekUsed: true,
      })
    ).toBe(false);
  });

  it("Pro and trials are unaffected, and never record it", () => {
    for (const freeWeekUsed of [false, true]) {
      const input = { isPro: true, runPlan: marathonWeek(5), freeWeekUsed };
      expect(racePlanLocked(input)).toBe(false);
      expect(racePlanFreeWeekToRecord(input)).toBe(false);
    }
  });
});

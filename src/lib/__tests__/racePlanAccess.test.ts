import { describe, it, expect } from "vitest";
import { lockedPlanRunStarts, racePlanLocked } from "../racePlanAccess";

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

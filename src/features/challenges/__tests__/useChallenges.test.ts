import { describe, it, expect } from "vitest";
import {
  resolveTier,
  getTimeRemaining,
  isTierAchieved,
} from "../useChallenges";

describe("resolveTier (cumulative)", () => {
  const tiers = { bronze: 10, silver: 25, gold: 50 };
  const M = "total_volume";

  it("returns null below bronze", () => {
    expect(resolveTier(0, tiers, M)).toBeNull();
    expect(resolveTier(9, tiers, M)).toBeNull();
  });

  it("returns bronze at threshold", () => {
    expect(resolveTier(10, tiers, M)).toBe("bronze");
    expect(resolveTier(24, tiers, M)).toBe("bronze");
  });

  it("returns silver at threshold", () => {
    expect(resolveTier(25, tiers, M)).toBe("silver");
    expect(resolveTier(49, tiers, M)).toBe("silver");
  });

  it("returns gold at threshold", () => {
    expect(resolveTier(50, tiers, M)).toBe("gold");
    expect(resolveTier(100, tiers, M)).toBe("gold");
  });
});

describe("resolveTier (fastest_effort)", () => {
  // Time thresholds: lower is better; gold is the quickest. 0 = no effort yet.
  const tiers = { bronze: 1800, silver: 1500, gold: 1200 };
  const M = "fastest_effort";

  it("treats 0 as no qualifying effort (no tier), not an instant win", () => {
    expect(resolveTier(0, tiers, M)).toBeNull();
  });

  it("awards gold for the quickest times", () => {
    expect(resolveTier(1200, tiers, M)).toBe("gold");
    expect(resolveTier(1000, tiers, M)).toBe("gold");
  });

  it("awards silver / bronze for slower times", () => {
    expect(resolveTier(1500, tiers, M)).toBe("silver");
    expect(resolveTier(1800, tiers, M)).toBe("bronze");
    expect(resolveTier(2000, tiers, M)).toBeNull();
  });
});

describe("getTimeRemaining", () => {
  /* Challenge ends snap to LOCAL MIDNIGHT of the end day
     (challengeLocalEndMs), so the previous wall-clock-relative inputs
     made these tests time-of-day-dependent: run in the last hour
     before UTC midnight, "now + 12h" crossed into tomorrow — whose
     local-midnight boundary was under an hour away — and read
     "54m left" (CI, 2026-08-08 23:06Z). The "Ended" case was likewise
     wrong for any timezone west of UTC in the evening. Pin `now`
     against an explicitly constructed boundary instead. The end-date
     VALUE uses local noon so its UTC day-key resolves to the intended
     day in any test timezone with |offset| < 12h (the suite's usual
     noon trick). */
  const endDate = new Date(2026, 0, 15, 12, 0, 0); // day-key 2026-01-15
  const endBoundary = new Date(2026, 0, 15, 0, 0, 0).getTime();

  it('returns "Ended" at and after the local end boundary', () => {
    expect(getTimeRemaining(endDate, endBoundary)).toBe("Ended");
    expect(getTimeRemaining(endDate, endBoundary + 100_000)).toBe("Ended");
  });

  it("returns days when more than a day remains", () => {
    expect(getTimeRemaining(endDate, endBoundary - 3 * 86_400_000)).toBe(
      "3 days left"
    );
  });

  it("returns hours inside the final day", () => {
    expect(getTimeRemaining(endDate, endBoundary - 12 * 3_600_000)).toBe(
      "12h left"
    );
  });

  it("returns minutes inside the final hour", () => {
    expect(getTimeRemaining(endDate, endBoundary - 54 * 60_000)).toBe(
      "54m left"
    );
  });
});

describe("isTierAchieved", () => {
  /* Cumulative metrics (workout_count / total_volume / total_km / etc):
     higher is better, threshold is a floor. */
  it("treats cumulative metrics as higher-is-better", () => {
    expect(isTierAchieved(0, 100, "total_volume")).toBe(false);
    expect(isTierAchieved(99, 100, "total_volume")).toBe(false);
    expect(isTierAchieved(100, 100, "total_volume")).toBe(true);
    expect(isTierAchieved(150, 100, "total_volume")).toBe(true);
  });

  /* fastest_effort is seconds-elapsed for a fixed distance — lower is
     better, and the user must have a qualifying time recorded
     (currentValue > 0) to count. The bug this guards against: a
     freshly-joined participant with currentValue 0 used to "achieve"
     every tier because 0 ≤ any threshold. */
  it("treats fastest_effort as lower-is-better and rejects zero", () => {
    expect(isTierAchieved(0, 1500, "fastest_effort")).toBe(false);
    expect(isTierAchieved(1500, 1500, "fastest_effort")).toBe(true);
    expect(isTierAchieved(1499, 1500, "fastest_effort")).toBe(true);
    expect(isTierAchieved(1501, 1500, "fastest_effort")).toBe(false);
  });

  it("handles unknown metrics by falling through to the higher-is-better default", () => {
    expect(isTierAchieved(50, 100, "unknown_metric")).toBe(false);
    expect(isTierAchieved(100, 100, "unknown_metric")).toBe(true);
  });
});

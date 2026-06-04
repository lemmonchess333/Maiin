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
  it('returns "Ended" for past dates', () => {
    const pastDate = new Date(Date.now() - 100000);
    expect(getTimeRemaining(pastDate)).toBe("Ended");
  });

  it("returns days for future dates > 1 day", () => {
    const futureDate = new Date(Date.now() + 3 * 86400000);
    const result = getTimeRemaining(futureDate);
    expect(result).toMatch(/^\d+ days left$/);
  });

  it("returns hours for future dates < 1 day", () => {
    const futureDate = new Date(Date.now() + 12 * 3600000);
    const result = getTimeRemaining(futureDate);
    expect(result).toMatch(/^\d+h left$/);
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

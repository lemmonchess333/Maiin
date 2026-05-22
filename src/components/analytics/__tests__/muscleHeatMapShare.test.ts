/**
 * MuscleHeatMap relative-volume share tiers — Hist5c pin 8.
 *
 * Replaces the previous absolute set-count buckets which saturated
 * the body diagram at long windows. Share-based tiers must survive
 * any window length: a chest at 22% reads "high" whether the window
 * is 1W with 50 total sets or 1Y with 2,500 total sets.
 */
import { describe, it, expect } from "vitest";
import { getShareTier } from "../muscleShare";

describe("getShareTier — relative share thresholds", () => {
  it("returns 'high' at ≥18% share", () => {
    expect(getShareTier(18, 100)).toBe("high");
    expect(getShareTier(50, 100)).toBe("high");
    expect(getShareTier(100, 100)).toBe("high");
  });

  it("returns 'mid' at 8-17% share", () => {
    expect(getShareTier(8, 100)).toBe("mid");
    expect(getShareTier(17, 100)).toBe("mid");
  });

  it("returns 'low' below 8% share", () => {
    expect(getShareTier(0, 100)).toBe("low");
    expect(getShareTier(5, 100)).toBe("low");
    expect(getShareTier(7, 100)).toBe("low");
  });
});

describe("getShareTier — survives any window length (Hist5c pin 8 invariant)", () => {
  it("22% chest reads 'high' at 1W with small totals", () => {
    /* 1W window: 11 sets chest / 50 total = 22% */
    expect(getShareTier(11, 50)).toBe("high");
  });

  it("22% chest reads 'high' at 1Y with large totals", () => {
    /* 1Y window: 550 sets chest / 2,500 total = 22% */
    expect(getShareTier(550, 2500)).toBe("high");
  });

  it("absolute set count alone never tips the tier", () => {
    /* Without normalization the prior code put anything >60 as 'high'.
       Here, 70 sets out of 1,000 (7% share) correctly reads 'low'. */
    expect(getShareTier(70, 1000)).toBe("low");
  });
});

describe("getShareTier — edge cases", () => {
  it("returns 'low' when totalSets is zero", () => {
    expect(getShareTier(0, 0)).toBe("low");
  });

  it("returns 'low' when totalSets is negative (defensive)", () => {
    expect(getShareTier(10, -5)).toBe("low");
  });

  it("threshold at exactly 18% is high", () => {
    expect(getShareTier(18, 100)).toBe("high");
  });

  it("threshold at exactly 8% is mid", () => {
    expect(getShareTier(8, 100)).toBe("mid");
  });
});

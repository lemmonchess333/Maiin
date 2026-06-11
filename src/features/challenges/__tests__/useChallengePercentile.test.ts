import { describe, it, expect } from "vitest";
import { topPercent } from "../useChallengePercentile";

describe("topPercent", () => {
  it("the leader sits in the smallest band the field allows", () => {
    // #1 of 50 = 1/50 = top 2%; #1 of 1000 = top 1% (the 1% floor).
    expect(topPercent(1, 50)).toBe(2);
    expect(topPercent(1, 1000)).toBe(1);
    expect(topPercent(1, 100)).toBe(1);
  });

  it("computes the ceiling percentile band", () => {
    // 20th of 50 = 40% → "top 40%".
    expect(topPercent(20, 50)).toBe(40);
    // 35th of 50 = 70%.
    expect(topPercent(35, 50)).toBe(70);
    // last place = 100%.
    expect(topPercent(50, 50)).toBe(100);
  });

  it("rounds up to the nearest whole percent (never understates rank)", () => {
    // 3rd of 50 = 6% exactly; 4th of 50 = 8%.
    expect(topPercent(3, 50)).toBe(6);
    // 11th of 200 = 5.5% → ceil → 6%.
    expect(topPercent(11, 200)).toBe(6);
  });

  it("guards a zero/negative field", () => {
    expect(topPercent(1, 0)).toBe(100);
  });
});

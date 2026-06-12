/**
 * Property-based guard for resolveTier MONOTONICITY.
 *
 * A participant's tier must move monotonically with their progress — more is
 * never worse. The cross-test pins client↔server equality + the fastest_effort
 * 0-guard; this fuzzes random tier sets and sweeps the value to assert the
 * direction is right for BOTH metric families (a flipped comparison would let a
 * tier go DOWN as you improve):
 *   - cumulative (total_volume, …): higher value ⇒ tier rank non-decreasing
 *   - fastest_effort: faster (lower, >0) value ⇒ tier rank non-decreasing;
 *     value 0 = "no qualifying effort" ⇒ no tier
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  resolveTier,
  isTierAchieved,
  type ChallengeTier,
  type ChallengeTiers,
} from "../challengeTiers";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANK: Record<ChallengeTier | "none", number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};
const rank = (t: ChallengeTier | null) => RANK[t ?? "none"];

describe("resolveTier monotonicity (property-based)", () => {
  it("cumulative metric: tier rank never decreases as value rises", () => {
    const rnd = mulberry32(501);
    for (let i = 0; i < 1500; i++) {
      const bronze = 1 + Math.round(rnd() * 1000);
      const silver = bronze + 1 + Math.round(rnd() * 1000);
      const gold = silver + 1 + Math.round(rnd() * 1000);
      const tiers: ChallengeTiers = { bronze, silver, gold };

      let prevRank = -1;
      for (let v = 0; v <= gold + 500; v += 1 + Math.floor(rnd() * 50)) {
        const r = rank(resolveTier(v, tiers, "total_volume"));
        expect(r).toBeGreaterThanOrEqual(prevRank);
        prevRank = r;
      }
      // At/above gold it's gold; below bronze it's none.
      expect(resolveTier(gold, tiers, "total_volume")).toBe("gold");
      expect(resolveTier(bronze - 1, tiers, "total_volume")).toBeNull();
    }
  });

  it("fastest_effort: tier rank never decreases as the time gets FASTER (smaller, >0)", () => {
    const rnd = mulberry32(502);
    for (let i = 0; i < 1500; i++) {
      // Faster = better → gold is the smallest (quickest) threshold.
      const gold = 60 + Math.round(rnd() * 300);
      const silver = gold + 1 + Math.round(rnd() * 300);
      const bronze = silver + 1 + Math.round(rnd() * 300);
      const tiers: ChallengeTiers = { bronze, silver, gold };

      let prevRank = -1;
      // Sweep from a slow time down toward 1 (faster) — rank must not drop.
      for (let v = bronze + 300; v >= 1; v -= 1 + Math.floor(rnd() * 30)) {
        const r = rank(resolveTier(v, tiers, "fastest_effort"));
        expect(r).toBeGreaterThanOrEqual(prevRank);
        prevRank = r;
      }
      // 0 = "no qualifying effort yet" → never a tier (the fixed server bug).
      expect(resolveTier(0, tiers, "fastest_effort")).toBeNull();
      // Hitting the bronze (slowest acceptable) time exactly qualifies bronze.
      expect(isTierAchieved(bronze, tiers.bronze, "fastest_effort")).toBe(true);
    }
  });

  it("no tier set ⇒ null regardless of value/metric", () => {
    const rnd = mulberry32(503);
    for (let i = 0; i < 500; i++) {
      const v = Math.round(rnd() * 10000);
      expect(resolveTier(v, null, "total_volume")).toBeNull();
      expect(resolveTier(v, undefined, "fastest_effort")).toBeNull();
    }
  });
});

/**
 * Server-side unit tests for challenge tier resolution
 * (functions/lib/challengeTiers.js) — the copy the Firestore triggers
 * (syncChallengeProgress / syncFastestEffortProgress) call to write
 * tierAchieved. Parity with the client TS copy is pinned separately by
 * src/features/challenges/__tests__/challengeTiers.cross.test.ts; this covers
 * the running copy directly, especially the fastest-effort `> 0` guard the old
 * inline server code lacked.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveTier, isTierAchieved } = require("../lib/challengeTiers");

describe("resolveTier — cumulative metrics", () => {
  const tiers = { bronze: 5000, silver: 25000, gold: 50000 };
  it("returns the highest tier reached", () => {
    expect(resolveTier(0, tiers, "total_volume")).toBeNull();
    expect(resolveTier(5000, tiers, "total_volume")).toBe("bronze");
    expect(resolveTier(25000, tiers, "total_volume")).toBe("silver");
    expect(resolveTier(60000, tiers, "total_volume")).toBe("gold");
  });
});

describe("resolveTier — fastest_effort (lower is better)", () => {
  const tiers = { bronze: 1800, silver: 1500, gold: 1200 };

  it("does NOT award a tier for a 0 value (no qualifying effort) — the fixed bug", () => {
    // Pre-consolidation the inline server block (`tiers.gold && newBest <= tiers.gold`)
    // would award gold for newBest=0. resolveTier guards value > 0.
    expect(resolveTier(0, tiers, "fastest_effort")).toBeNull();
  });

  it("awards gold for the quickest, scaling down for slower", () => {
    expect(resolveTier(1100, tiers, "fastest_effort")).toBe("gold");
    expect(resolveTier(1200, tiers, "fastest_effort")).toBe("gold");
    expect(resolveTier(1500, tiers, "fastest_effort")).toBe("silver");
    expect(resolveTier(1800, tiers, "fastest_effort")).toBe("bronze");
    expect(resolveTier(2000, tiers, "fastest_effort")).toBeNull();
  });
});

describe("resolveTier — defensive", () => {
  it("returns null for missing tiers object", () => {
    expect(resolveTier(100, null, "total_volume")).toBeNull();
    expect(resolveTier(100, undefined, "fastest_effort")).toBeNull();
  });
  it("treats a non-finite threshold as unreachable", () => {
    expect(isTierAchieved(100, NaN, "total_volume")).toBe(false);
    expect(isTierAchieved(100, undefined, "total_volume")).toBe(false);
  });
});

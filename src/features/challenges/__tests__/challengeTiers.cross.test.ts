/**
 * Cross-consistency test for the TS + JS copies of challenge tier resolution.
 *
 * `tierAchieved` is written on BOTH the client (`updateProgress`) and the
 * server (`syncChallengeProgress` / `syncFastestEffortProgress`), so the two
 * tier resolvers MUST agree or a participant's stored tier flickers between
 * writers. Before consolidation the server inlined this twice with divergent
 * semantics (no `> 0` guard for fastest_effort; `|| Infinity` / `&&`-truthiness
 * coercions). This runs identical fixtures through both copies and asserts
 * byte-identical output. Drift fails CI.
 *
 * Same mirror+parity discipline as performanceEngineParity / runModeResolution /
 * scheduledRunCompletion.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as ts from "../challengeTiers";

const require = createRequire(import.meta.url);
const js = require("../../../../functions/lib/challengeTiers") as typeof ts;

const CUMULATIVE = { bronze: 10, silver: 25, gold: 50 };
const FASTEST = { bronze: 1800, silver: 1500, gold: 1200 };

interface Case {
  value: number;
  tiers: { bronze: number; silver: number; gold: number } | null | undefined;
  metric: string;
}

// Exercises every branch + the historical divergence points (value 0 on
// fastest, a 0 threshold, a missing threshold).
const cases: Case[] = [
  // cumulative boundaries
  { value: 0, tiers: CUMULATIVE, metric: "total_volume" },
  { value: 9, tiers: CUMULATIVE, metric: "total_volume" },
  { value: 10, tiers: CUMULATIVE, metric: "total_volume" },
  { value: 25, tiers: CUMULATIVE, metric: "streak_days" },
  { value: 50, tiers: CUMULATIVE, metric: "combined_score" },
  { value: 999, tiers: CUMULATIVE, metric: "total_volume" },
  // fastest_effort boundaries — incl. the 0 guard the server used to miss
  { value: 0, tiers: FASTEST, metric: "fastest_effort" },
  { value: 1200, tiers: FASTEST, metric: "fastest_effort" },
  { value: 1201, tiers: FASTEST, metric: "fastest_effort" },
  { value: 1500, tiers: FASTEST, metric: "fastest_effort" },
  { value: 1800, tiers: FASTEST, metric: "fastest_effort" },
  { value: 5000, tiers: FASTEST, metric: "fastest_effort" },
  // degenerate thresholds — 0 threshold + missing tier
  {
    value: 5,
    tiers: { bronze: 0, silver: 10, gold: 20 },
    metric: "total_volume",
  },
  {
    value: 5,
    tiers: { bronze: 10, silver: 25, gold: NaN },
    metric: "total_volume",
  },
  // null/undefined tiers
  { value: 100, tiers: null, metric: "total_volume" },
  { value: 100, tiers: undefined, metric: "fastest_effort" },
];

describe("challengeTiers — client (.ts) ↔ server (.js) parity", () => {
  it("exposes the same surface on both copies", () => {
    expect(typeof ts.resolveTier).toBe("function");
    expect(typeof ts.isTierAchieved).toBe("function");
    expect(typeof js.resolveTier).toBe("function");
    expect(typeof js.isTierAchieved).toBe("function");
  });

  for (const c of cases) {
    it(`resolveTier agrees: value=${c.value} metric=${c.metric} tiers=${JSON.stringify(c.tiers)}`, () => {
      expect(js.resolveTier(c.value, c.tiers, c.metric)).toBe(
        ts.resolveTier(c.value, c.tiers, c.metric)
      );
    });
  }

  it("isTierAchieved agrees across the per-threshold matrix", () => {
    for (const metric of ["total_volume", "fastest_effort"]) {
      for (const value of [0, 1, 10, 1200, 1500, 1800]) {
        for (const threshold of [0, 10, 1200, 1500, NaN]) {
          expect(js.isTierAchieved(value, threshold, metric)).toBe(
            ts.isTierAchieved(value, threshold, metric)
          );
        }
      }
    }
  });

  // The bug the consolidation fixed: a fastest_effort value of 0 ("no
  // qualifying effort") must NOT be awarded a tier on either copy.
  it("fastest_effort value of 0 yields no tier (the fixed server bug)", () => {
    expect(ts.resolveTier(0, FASTEST, "fastest_effort")).toBeNull();
    expect(js.resolveTier(0, FASTEST, "fastest_effort")).toBeNull();
  });
});

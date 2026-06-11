/**
 * Cross-consistency test for the TS + JS copies of the run volume-eligibility
 * predicate.
 *
 * `isVolumeEligible` decides whether a saved run counts toward total runs,
 * total distance, weekly km, lifetime totals, streak days, PRs, and the crew
 * leaderboards. It exists as two physical copies:
 *   - client `src/lib/runStatsEligibility.ts:isVolumeEligible` (History
 *     filtering, weekly stats, PR computation, leaderboards read this)
 *   - server `functions/lib/runEligibility.js:isVolumeEligibleRun` (the
 *     `onRunCreated` challenge/PR sync + partner-streak eligibility read this)
 *
 * The server file's header says "Keep this file in lockstep with the TS
 * source — any eligibility rule added there must be added here", but nothing
 * pinned them EQUAL. A divergence would mean a run counts toward a user's
 * challenge/leaderboard standing on one side but not the other (or inflates
 * stats the server never credited). This closes that gap: identical fixtures
 * through both copies, asserting identical output. Drift fails CI.
 *
 * Same mirror+parity discipline as `performanceEngineParity.cross.test.ts` and
 * `runModeResolution.cross.test.ts`. If a future refactor adopts a single
 * shared CommonJS source, this test can be deleted in favour of importing it
 * directly.
 *
 * Note: the two copies export under different names (client
 * `isVolumeEligible`, server `isVolumeEligibleRun`) and the server adds a
 * defensive `if (!data) return false` null-guard the client lacks (the client
 * contract is a non-null RunRecord). The fixtures below are all object-shaped
 * (the realistic persisted-doc inputs both copies actually receive); the
 * null-record case is asserted separately as a server-only safety property,
 * not as a parity case.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { isVolumeEligible } from "@/lib/runStatsEligibility";

const require = createRequire(import.meta.url);
const js = require("../../../functions/lib/runEligibility") as {
  isVolumeEligibleRun: (data: unknown) => boolean;
};

// Edge-case table — every interesting boundary + type + flag combination the
// predicate has to agree on. `unknown`-typed because we deliberately feed
// malformed shapes (strings, NaN, missing fields) that real Firestore docs
// can carry, to prove both copies coerce identically.
const FIXTURES: Array<{ name: string; doc: Record<string, unknown> }> = [
  // boundaries
  { name: "exactly at floor (50m / 30s)", doc: { distance: 50, duration: 30 } },
  { name: "distance just under floor", doc: { distance: 49.9, duration: 30 } },
  { name: "duration just under floor", doc: { distance: 50, duration: 29 } },
  { name: "both comfortably above", doc: { distance: 5000, duration: 1800 } },
  { name: "marathon", doc: { distance: 42195, duration: 12600 } },
  // zero / falsy numbers
  { name: "zero distance", doc: { distance: 0, duration: 600 } },
  { name: "zero duration", doc: { distance: 600, duration: 0 } },
  { name: "both zero", doc: { distance: 0, duration: 0 } },
  // missing fields
  { name: "missing duration", doc: { distance: 600 } },
  { name: "missing distance", doc: { duration: 600 } },
  { name: "empty object", doc: {} },
  // explicit nullish on fields
  { name: "null distance", doc: { distance: null, duration: 600 } },
  { name: "undefined duration", doc: { distance: 600, duration: undefined } },
  // non-finite
  { name: "NaN distance", doc: { distance: NaN, duration: 600 } },
  { name: "NaN duration", doc: { distance: 600, duration: NaN } },
  { name: "Infinity distance", doc: { distance: Infinity, duration: 600 } },
  // string-typed numbers (Firestore data() can surface these from bad writes)
  {
    name: "string numbers above floor",
    doc: { distance: "600", duration: "600" },
  },
  {
    name: "string numbers below floor",
    doc: { distance: "40", duration: "600" },
  },
  // flags
  {
    name: "isInvalid flagged",
    doc: { distance: 5000, duration: 1800, isInvalid: true },
  },
  {
    name: "savedAnyway flagged",
    doc: { distance: 5000, duration: 1800, savedAnyway: true },
  },
  {
    name: "isInvalid false (explicit)",
    doc: { distance: 5000, duration: 1800, isInvalid: false },
  },
  {
    name: "both flags on a valid run",
    doc: { distance: 5000, duration: 1800, isInvalid: true, savedAnyway: true },
  },
  // extra unrelated fields don't change the verdict
  {
    name: "valid run with extra fields",
    doc: {
      distance: 5000,
      duration: 1800,
      activityType: "tempo",
      avgPace: 360,
    },
  },
];

describe("run volume-eligibility — client (.ts) ↔ server (.js) parity", () => {
  it("both copies expose the predicate", () => {
    expect(typeof isVolumeEligible).toBe("function");
    expect(typeof js.isVolumeEligibleRun).toBe("function");
  });

  it("agrees on every fixture", () => {
    for (const { name, doc } of FIXTURES) {
      const tsResult = isVolumeEligible(
        doc as Parameters<typeof isVolumeEligible>[0]
      );
      const jsResult = js.isVolumeEligibleRun(doc);
      expect(
        jsResult,
        `divergence on "${name}": client=${tsResult} server=${jsResult}`
      ).toBe(tsResult);
    }
  });

  // Value-pinned expectations (not just cross-equality) so the test also
  // documents the contract and catches BOTH copies drifting together.
  it("encodes the documented floor: 50m AND 30s, flags exclude", () => {
    expect(isVolumeEligible({ distance: 50, duration: 30 })).toBe(true);
    expect(isVolumeEligible({ distance: 49, duration: 30 })).toBe(false);
    expect(isVolumeEligible({ distance: 50, duration: 29 })).toBe(false);
    expect(
      isVolumeEligible({ distance: 5000, duration: 1800, isInvalid: true })
    ).toBe(false);
    expect(
      isVolumeEligible({ distance: 5000, duration: 1800, savedAnyway: true })
    ).toBe(false);
  });

  // Server-only safety property: the JS copy null-guards a missing record
  // (the client contract guarantees a non-null RunRecord, so it has no guard).
  it("server defensively rejects a null/undefined record", () => {
    expect(js.isVolumeEligibleRun(null)).toBe(false);
    expect(js.isVolumeEligibleRun(undefined)).toBe(false);
  });
});

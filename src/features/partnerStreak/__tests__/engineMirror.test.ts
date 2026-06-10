import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  recordPartnerActivity as recordTs,
  emptyStreakState,
  dayDiff as dayDiffTs,
  weekKey as weekKeyTs,
  type PartnerStreakState,
} from "../streakEngine";

// The server runs the JS mirror, not this TS source. Require it directly so
// any drift between the two surfaces fails HERE rather than silently in
// production (the "tested copy ≠ running copy" guard).
const require = createRequire(import.meta.url);
const jsMirror =
  require("../../../../functions/lib/partnerStreakEngine.js") as {
    recordPartnerActivity: (
      state: PartnerStreakState,
      member: string,
      localDay: string,
      members: readonly [string, string]
    ) => PartnerStreakState;
    dayDiff: (a: string, b: string) => number;
    weekKey: (day: string) => string;
  };

const MEMBERS = ["alice", "bob"] as const;

/**
 * Every scenario is a sequence of [member, localDay] logs. We replay each
 * against BOTH engines and assert the state is identical after EVERY step
 * (not just the end) — so a divergence is caught at the exact event.
 */
const SCENARIOS: Record<string, [string, string][]> = {
  "bank then mutual": [
    ["alice", "2026-06-10"],
    ["bob", "2026-06-10"],
  ],
  "consecutive run of 3": [
    ["alice", "2026-06-10"],
    ["bob", "2026-06-10"],
    ["bob", "2026-06-11"],
    ["alice", "2026-06-11"],
    ["alice", "2026-06-12"],
    ["bob", "2026-06-12"],
  ],
  "same-day re-apply (idempotent)": [
    ["alice", "2026-06-10"],
    ["bob", "2026-06-10"],
    ["alice", "2026-06-10"],
    ["bob", "2026-06-10"],
  ],
  "single-gap freeze bridge": [
    ["alice", "2026-06-10"],
    ["bob", "2026-06-10"],
    ["alice", "2026-06-12"],
    ["bob", "2026-06-12"],
  ],
  "exhaust both weekly freezes then reset": [
    ["alice", "2026-06-08"],
    ["bob", "2026-06-08"],
    ["alice", "2026-06-10"],
    ["bob", "2026-06-10"],
    ["alice", "2026-06-12"],
    ["bob", "2026-06-12"],
    ["alice", "2026-06-14"],
    ["bob", "2026-06-14"],
  ],
  "freeze refreshes next week": [
    ["alice", "2026-06-08"],
    ["bob", "2026-06-08"],
    ["alice", "2026-06-10"],
    ["bob", "2026-06-10"],
    ["alice", "2026-06-17"],
    ["bob", "2026-06-17"],
  ],
  "cross-tz arrival order": [
    ["bob", "2026-06-12"],
    ["alice", "2026-06-12"],
  ],
  "one partner races ahead, other catches up": [
    ["alice", "2026-06-10"],
    ["alice", "2026-06-11"],
    ["alice", "2026-06-12"],
    ["bob", "2026-06-12"],
  ],
  "spring-forward DST boundary": [
    ["alice", "2026-03-28"],
    ["bob", "2026-03-28"],
    ["alice", "2026-03-29"],
    ["bob", "2026-03-29"],
  ],
};

describe("partnerStreakEngine JS mirror ≡ TS source", () => {
  it.each(Object.entries(SCENARIOS))(
    "produces identical state at every step: %s",
    (_name, events) => {
      let ts: PartnerStreakState = emptyStreakState();
      let js: PartnerStreakState = emptyStreakState();
      for (const [member, day] of events) {
        ts = recordTs(ts, member, day, MEMBERS);
        js = jsMirror.recordPartnerActivity(js, member, day, MEMBERS);
        expect(js).toEqual(ts);
      }
    }
  );

  it("dayDiff matches across a DST boundary", () => {
    expect(jsMirror.dayDiff("2026-03-28", "2026-03-29")).toBe(
      dayDiffTs("2026-03-28", "2026-03-29")
    );
    expect(jsMirror.dayDiff("2026-06-08", "2026-06-15")).toBe(7);
  });

  it("weekKey is Monday-anchored and matches the TS source", () => {
    for (const day of [
      "2026-06-12",
      "2026-06-08",
      "2026-06-14",
      "2026-06-15",
    ]) {
      expect(jsMirror.weekKey(day)).toBe(weekKeyTs(day));
    }
    // Pin the anchor explicitly so a Sunday-anchored regression is loud.
    expect(jsMirror.weekKey("2026-06-14")).toBe("2026-06-08"); // Sunday → prior Monday
  });
});

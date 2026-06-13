/**
 * functions/lib/badgeRules.js — pure server-side milestone-badge rules.
 *
 * PARITY: these ids mirror the client catalogue (src/features/streaks/badges.ts
 * BADGE_DEFINITIONS) since functions/ can't import the TS. The id-set test
 * below is the tripwire if the running milestones drift apart.
 */
import { describe, it, expect } from "vitest";
import { runMilestoneBadges, RUN_DISTANCE_MILESTONES } from "../lib/badgeRules";

describe("runMilestoneBadges — distance", () => {
  it("awards nothing below 5K", () => {
    expect(runMilestoneBadges(4999, 1800)).toEqual([]);
  });

  it("awards first_5k at exactly 5 km", () => {
    expect(runMilestoneBadges(5000, 1800)).toContain("first_5k");
  });

  it("awards every distance tier crossed in one run", () => {
    // A 42.3 km run clears all four.
    expect(runMilestoneBadges(42300, 4 * 3600)).toEqual(
      expect.arrayContaining([
        "first_5k",
        "10k_club",
        "half_marathon",
        "marathon",
      ])
    );
  });

  it("a 21.1 km run clears the half (21097 m)", () => {
    expect(runMilestoneBadges(21100, 7200)).toContain("half_marathon");
    expect(runMilestoneBadges(21100, 7200)).not.toContain("marathon");
  });
});

describe("runMilestoneBadges — speed_demon (sub-5:00/km)", () => {
  it("awards on a real run under 5:00/km", () => {
    // 2 km in 9:00 (540 s) = 4:30/km.
    expect(runMilestoneBadges(2000, 540)).toContain("speed_demon");
  });

  it("does not award at exactly 5:00/km", () => {
    // 2 km in 10:00 (600 s) = 5:00/km — must be STRICTLY under.
    expect(runMilestoneBadges(2000, 600)).not.toContain("speed_demon");
  });

  it("ignores sub-1km sprints (anti-gaming floor)", () => {
    // 800 m in 2:00 = 2:30/km, but under the 1 km floor → no badge.
    expect(runMilestoneBadges(800, 120)).not.toContain("speed_demon");
  });

  it("a slow long run earns the distance badge but not speed_demon", () => {
    // 5 km in 30:00 = 6:00/km.
    const ids = runMilestoneBadges(5000, 1800);
    expect(ids).toContain("first_5k");
    expect(ids).not.toContain("speed_demon");
  });
});

describe("runMilestoneBadges — guards", () => {
  it("returns [] for zero / missing distance or duration", () => {
    expect(runMilestoneBadges(0, 0)).toEqual([]);
    expect(runMilestoneBadges(undefined, undefined)).toEqual([]);
    expect(runMilestoneBadges("nope", "nope")).toEqual([]);
  });
});

describe("PARITY — running milestone ids match the client catalogue", () => {
  it("pins the exact distance-badge id set", () => {
    expect(RUN_DISTANCE_MILESTONES.map((m) => m.id)).toEqual([
      "first_5k",
      "10k_club",
      "half_marathon",
      "marathon",
    ]);
  });
});

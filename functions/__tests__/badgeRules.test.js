/**
 * functions/lib/badgeRules.js — pure server-side milestone-badge rules.
 *
 * PARITY: these ids mirror the client catalogue (src/features/streaks/badges.ts
 * BADGE_DEFINITIONS) since functions/ can't import the TS. The id-set test
 * below is the tripwire if the running milestones drift apart.
 */
import { describe, it, expect } from "vitest";
import {
  runMilestoneBadges,
  lifetimeMilestoneBadges,
  liftWeightMilestoneBadges,
  RUN_DISTANCE_MILESTONES,
  LIFETIME_RUN_METERS_MILESTONE,
  LIFETIME_LIFT_VOLUME_KG_MILESTONE,
  COMPOUND_LIFT_IDS,
  LIFT_WEIGHT_MILESTONES,
} from "../lib/badgeRules";

const ex = (exerciseId, ...weights) => ({
  exerciseId,
  sets: weights.map((weightKg) => ({ weightKg })),
});

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

describe("lifetimeMilestoneBadges — running distance (century_km)", () => {
  it("awards nothing below 100 km", () => {
    expect(lifetimeMilestoneBadges("run", 99999)).toEqual([]);
  });

  it("awards century_km at exactly 100 km", () => {
    expect(
      lifetimeMilestoneBadges("run", LIFETIME_RUN_METERS_MILESTONE)
    ).toEqual(["century_km"]);
  });

  it("keeps awarding past the line (idempotent re-pass)", () => {
    // The downstream award is earnedAt-idempotent, so an over-threshold total
    // always returns the id — re-passing is a harmless no-op award.
    expect(lifetimeMilestoneBadges("run", 250000)).toEqual(["century_km"]);
  });
});

describe("lifetimeMilestoneBadges — lift volume (tonnage_100)", () => {
  it("awards nothing below 100 tonnes", () => {
    expect(lifetimeMilestoneBadges("lift", 99999)).toEqual([]);
  });

  it("awards tonnage_100 at exactly 100 tonnes (100000 kg)", () => {
    expect(
      lifetimeMilestoneBadges("lift", LIFETIME_LIFT_VOLUME_KG_MILESTONE)
    ).toEqual(["tonnage_100"]);
  });
});

describe("lifetimeMilestoneBadges — guards", () => {
  it("returns [] for an unknown kind even over the threshold", () => {
    expect(lifetimeMilestoneBadges("swim", 500000)).toEqual([]);
  });

  it("returns [] for non-finite / zero totals", () => {
    expect(lifetimeMilestoneBadges("run", 0)).toEqual([]);
    expect(lifetimeMilestoneBadges("lift", undefined)).toEqual([]);
    expect(lifetimeMilestoneBadges("run", "nope")).toEqual([]);
  });

  it("never cross-awards (a run total can't earn the lift badge)", () => {
    expect(lifetimeMilestoneBadges("run", 200000)).not.toContain("tonnage_100");
    expect(lifetimeMilestoneBadges("lift", 200000)).not.toContain("century_km");
  });
});

describe("liftWeightMilestoneBadges — Plate Club", () => {
  it("awards nothing below 60 kg on a compound", () => {
    expect(liftWeightMilestoneBadges([ex("bench-press", 40, 50)])).toEqual([]);
  });

  it("awards plate_club at 60 kg on a compound", () => {
    expect(liftWeightMilestoneBadges([ex("squat", 60)])).toEqual([
      "plate_club",
    ]);
  });

  it("awards every tier the heaviest compound set clears", () => {
    expect(liftWeightMilestoneBadges([ex("deadlift", 100, 140)])).toEqual([
      "plate_club",
      "two_plate",
      "three_plate",
    ]);
  });

  it("takes the max across exercises + sets", () => {
    const ids = liftWeightMilestoneBadges([
      ex("bench-press", 80),
      ex("overhead-press", 50),
      ex("squat", 105, 95),
    ]);
    expect(ids).toEqual(["plate_club", "two_plate"]);
    expect(ids).not.toContain("three_plate");
  });

  it("ignores weight on a NON-compound (isolation) lift", () => {
    // 140 kg barbell curl shouldn't gift three_plate.
    expect(liftWeightMilestoneBadges([ex("barbell-curl", 140)])).toEqual([]);
  });

  it("handles missing / malformed input safely", () => {
    expect(liftWeightMilestoneBadges(undefined)).toEqual([]);
    expect(liftWeightMilestoneBadges([])).toEqual([]);
    expect(liftWeightMilestoneBadges([{ exerciseId: "squat" }])).toEqual([]);
    expect(
      liftWeightMilestoneBadges([{ exerciseId: "squat", sets: [{}] }])
    ).toEqual([]);
  });
});

describe("PARITY — milestone ids match the client catalogue", () => {
  it("pins the exact distance-badge id set", () => {
    expect(RUN_DISTANCE_MILESTONES.map((m) => m.id)).toEqual([
      "first_5k",
      "10k_club",
      "half_marathon",
      "marathon",
    ]);
  });

  it("pins the lifetime-aggregate badge ids", () => {
    expect(
      lifetimeMilestoneBadges("run", LIFETIME_RUN_METERS_MILESTONE)
    ).toEqual(["century_km"]);
    expect(
      lifetimeMilestoneBadges("lift", LIFETIME_LIFT_VOLUME_KG_MILESTONE)
    ).toEqual(["tonnage_100"]);
  });

  it("pins the Plate-Club tier id set", () => {
    expect(LIFT_WEIGHT_MILESTONES.map((m) => m.id)).toEqual([
      "plate_club",
      "two_plate",
      "three_plate",
    ]);
  });

  it("classifies representative compound vs isolation lifts", () => {
    // Tripwire: the big multi-joint barbell lifts are IN…
    for (const id of [
      "bench-press",
      "squat",
      "deadlift",
      "overhead-press",
      "barbell-row",
    ]) {
      expect(COMPOUND_LIFT_IDS.has(id)).toBe(true);
    }
    // …and barbell isolation work is OUT.
    for (const id of [
      "barbell-curl",
      "barbell-shrug",
      "skull-crushers",
      "barbell-upright-row",
    ]) {
      expect(COMPOUND_LIFT_IDS.has(id)).toBe(false);
    }
  });
});

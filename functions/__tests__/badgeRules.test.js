/**
 * functions/lib/badgeRules.js — every badge's rule, on the server (App1 Q33).
 *
 * PARITY: these ids mirror the client catalogue (src/features/streaks/badges.ts
 * BADGE_DEFINITIONS). The REAL tripwire is the client-side cross-test
 * (src/features/streaks/__tests__/badgeCatalogueParity.cross.test.ts), which
 * loads THIS module via createRequire and pins every server-awardable id into
 * the catalogue — the id-set literals below only pin this side's spelling.
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
  BADGE_IDS,
  addDays,
  streakBadges,
  hybridBadges,
  maxConsecutiveDayRun,
  mealPrepBadges,
  nutritionBadgeDays,
  nutritionBadges,
  earlyDayOf,
  keptEarlyDays,
  earlyBirdBadges,
  ultimateAthleteDue,
  firstPrBadges,
  programmeCompleteBadges,
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

/* ── Every other badge (App1 Q33: every badge is awarded by the server).
   These cases lived in src/features/streaks/__tests__/badgeEarning.test.ts
   while the app awarded them; badgeRules.cross.test.ts pins the app's
   progress rings to these rules. ── */

/** `n` consecutive day keys ending on `end`, oldest first. */
function daysEnding(end, n) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

describe("BADGE_IDS", () => {
  it("names thirty distinct badges", () => {
    expect(BADGE_IDS).toHaveLength(30);
    expect(new Set(BADGE_IDS).size).toBe(30);
  });
});

describe("streakBadges", () => {
  it("awards nothing below a day, and nothing for junk", () => {
    expect(streakBadges(0)).toEqual([]);
    expect(streakBadges(-3)).toEqual([]);
    expect(streakBadges(Number.NaN)).toEqual([]);
  });

  it("awards every threshold crossed at once, at the exact boundary", () => {
    expect(streakBadges(1)).toEqual(["first_step"]);
    expect(streakBadges(7)).toEqual([
      "first_step",
      "three_day",
      "week_warrior",
    ]);
    expect(streakBadges(365)).toContain("year_long");
    expect(streakBadges(364)).not.toContain("year_long");
  });
});

describe("hybridBadges", () => {
  const day = "2026-05-20";

  it("hybrid_athlete: a lift and a run within a week holding the day", () => {
    expect(hybridBadges([day], ["2026-05-14"], day)).toEqual([
      "hybrid_athlete",
    ]);
    // Eight days apart is no week.
    expect(hybridBadges([day], ["2026-05-12"], day)).toEqual([]);
  });

  it("iron_runner: 3 lift days and 3 run days in one week, not 2", () => {
    const three = daysEnding(day, 3);
    expect(hybridBadges(three, three, day)).toEqual([
      "hybrid_athlete",
      "iron_runner",
    ]);
    expect(hybridBadges(three, three.slice(1), day)).toEqual([
      "hybrid_athlete",
    ]);
  });

  it("counts distinct days: three sessions on one day are one", () => {
    expect(hybridBadges([day, day, day], [day, day, day], day)).toEqual([
      "hybrid_athlete",
    ]);
  });

  it("balanced: 5 lift days and 5 run days within 14 days, not 4", () => {
    const lifts = daysEnding(day, 14).filter((_, i) => i % 3 === 0); // 5 days
    const runs = daysEnding(day, 14).filter((_, i) => i % 3 === 1); // 5 days
    expect(lifts).toHaveLength(5);
    expect(hybridBadges(lifts, runs, day)).toContain("balanced");
    expect(hybridBadges(lifts.slice(1), runs, day)).not.toContain("balanced");
  });

  it("judges a session backfilled into an old week in that week", () => {
    // A run saved today for 3 May completes that week's iron_runner.
    const lifts = ["2026-05-01", "2026-05-02", "2026-05-03"];
    const runs = ["2026-05-04", "2026-05-05", "2026-05-03"];
    expect(hybridBadges(lifts, runs, "2026-05-03")).toContain("iron_runner");
  });

  it("only a window that holds the day counts", () => {
    // A full week ten days before the focus day was judged when it happened.
    const old = daysEnding("2026-05-10", 3);
    expect(hybridBadges(old, old, day)).toEqual([]);
  });

  it("reads nothing from a focus that is not a day", () => {
    expect(hybridBadges([day], [day], "")).toEqual([]);
  });
});

describe("maxConsecutiveDayRun", () => {
  it("is the longest run, across months, ignoring junk and duplicates", () => {
    expect(maxConsecutiveDayRun([])).toBe(0);
    expect(
      maxConsecutiveDayRun(["2026-04-29", "2026-04-30", "2026-05-01"])
    ).toBe(3);
    expect(
      maxConsecutiveDayRun([
        ...daysEnding("2026-05-14", 5),
        ...daysEnding("2026-05-20", 3),
        "2026-05-20",
        "nope",
      ])
    ).toBe(5);
  });
});

describe("mealPrepBadges", () => {
  it("awards on 14 days straight, and not on 13 (no grace)", () => {
    expect(mealPrepBadges(daysEnding("2026-05-20", 14))).toEqual([
      "meal_prep_master",
    ]);
    expect(mealPrepBadges(daysEnding("2026-05-20", 13))).toEqual([]);
    const gap = daysEnding("2026-05-20", 15).filter((_, i) => i !== 7);
    expect(mealPrepBadges(gap)).toEqual([]);
  });
});

describe("nutritionBadgeDays + nutritionBadges", () => {
  const target = { protein: 150, carbs: 250, fat: 70 };
  const map = (days, value) => new Map(days.map((d) => [d, value]));

  it("macro_master: one day with every macro within 5%", () => {
    const meals = map(["2026-05-20"], { protein: 155, carbs: 245, fat: 72 });
    const days = nutritionBadgeDays(
      meals,
      map(["2026-05-20"], target),
      new Map()
    );
    expect(nutritionBadges(days, [], [])).toEqual(["macro_master"]);
    // No target snapshot that day: judged against nothing.
    const none = nutritionBadgeDays(meals, new Map(), new Map());
    expect(nutritionBadges(none, [], [])).toEqual([]);
  });

  it("protein_pro: protein met 7 days in a row, not 6", () => {
    const seven = daysEnding("2026-05-20", 7);
    const meals = map(seven, { protein: 200, carbs: 0, fat: 0 });
    const targets = map(seven, target);
    expect(
      nutritionBadges(nutritionBadgeDays(meals, targets, new Map()), [], [])
    ).toEqual(["protein_pro"]);
    meals.delete(seven[3]);
    expect(
      nutritionBadges(nutritionBadgeDays(meals, targets, new Map()), [], [])
    ).toEqual([]);
  });

  it("hydration_hero: water target met 7 days in a row", () => {
    const water = map(daysEnding("2026-05-20", 7), { ml: 2000, target: 2000 });
    expect(
      nutritionBadges(nutritionBadgeDays(new Map(), new Map(), water), [], [])
    ).toEqual(["hydration_hero"]);
    water.set("2026-05-17", { ml: 1999, target: 2000 });
    expect(
      nutritionBadges(nutritionBadgeDays(new Map(), new Map(), water), [], [])
    ).toEqual([]);
  });

  it("triple_threat: the macro day is also a lift day and a run day", () => {
    const days = { macroMasterDays: ["2026-05-20"] };
    expect(nutritionBadges(days, ["2026-05-20"], ["2026-05-20"])).toEqual([
      "macro_master",
      "triple_threat",
    ]);
    expect(nutritionBadges(days, ["2026-05-20"], ["2026-05-19"])).toEqual([
      "macro_master",
    ]);
  });
});

describe("early_bird", () => {
  it("is the local day of a log before 07:00 where the person is", () => {
    // 05:30 UTC is 06:30 in London (BST): early, on that day.
    expect(
      earlyDayOf(Date.parse("2026-06-10T05:30:00Z"), "Europe/London")
    ).toBe("2026-06-10");
    // 06:30 UTC is 07:30 there: not early.
    expect(
      earlyDayOf(Date.parse("2026-06-10T06:30:00Z"), "Europe/London")
    ).toBe(null);
    // 18:00 UTC is 06:00 next day in Auckland (NZST).
    expect(
      earlyDayOf(Date.parse("2026-06-10T18:00:00Z"), "Pacific/Auckland")
    ).toBe("2026-06-11");
    // Midnight is early, and hour 0, not 24.
    expect(earlyDayOf(Date.parse("2026-01-10T00:00:00Z"), "UTC")).toBe(
      "2026-01-10"
    );
  });

  it("judges nothing without a timezone or a time", () => {
    expect(earlyDayOf(Date.parse("2026-06-10T05:30:00Z"), null)).toBe(null);
    expect(earlyDayOf(Number.NaN, "UTC")).toBe(null);
    expect(earlyDayOf(0, "Not/AZone")).toBe(null);
  });

  it("keeps the earliest five distinct days, so a full list never changes", () => {
    expect(
      keptEarlyDays(
        ["2026-05-09", "2026-05-01"],
        ["2026-05-02", "2026-05-08", "2026-05-03", "2026-05-01", "bad"]
      )
    ).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-08",
      "2026-05-09",
    ]);
  });

  it("awards on five distinct days, need not be in a row, not on four", () => {
    const five = [
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ];
    expect(earlyBirdBadges(five)).toEqual(["early_bird"]);
    expect(earlyBirdBadges(five.slice(1))).toEqual([]);
    expect(earlyBirdBadges([...five.slice(1), five[1]])).toEqual([]);
  });
});

describe("ultimateAthleteDue", () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `b${i}`);
  it("is due at fifteen other badges, and never counts itself", () => {
    expect(ultimateAthleteDue(ids(15))).toBe(true);
    expect(ultimateAthleteDue(ids(14))).toBe(false);
    expect(ultimateAthleteDue([...ids(14), "ultimate_athlete"])).toBe(false);
  });
});

describe("firstPrBadges", () => {
  it("awards first_pr for a workout carrying new bests", () => {
    expect(firstPrBadges({ newBests: 2 })).toEqual(["first_pr"]);
    expect(firstPrBadges({ newBests: 0 })).toEqual([]);
    expect(firstPrBadges({})).toEqual([]);
    expect(firstPrBadges(null)).toEqual([]);
  });
});

describe("programmeCompleteBadges", () => {
  const week = (n, days) => ({ weekNumber: n, workouts: days });
  const done = { completed: true };
  const skipped = { skipped: true };
  const open = {};

  it("awards on moving on from a cycle's last week with its days done", () => {
    expect(
      programmeCompleteBadges(week(4, [done, skipped]), week(5, []))
    ).toEqual(["programme_complete"]);
    expect(programmeCompleteBadges(week(8, [done]), week(9, []))).toEqual([
      "programme_complete",
    ]);
  });

  it("not mid-cycle, not with a day left, not a week skipped end to end", () => {
    expect(programmeCompleteBadges(week(3, [done]), week(4, []))).toEqual([]);
    expect(programmeCompleteBadges(week(4, [done, open]), week(5, []))).toEqual(
      []
    );
    expect(
      programmeCompleteBadges(week(4, [skipped, skipped]), week(5, []))
    ).toEqual([]);
    expect(programmeCompleteBadges(week(4, []), week(5, []))).toEqual([]);
  });

  it("not unless the plan moved on by one week", () => {
    expect(programmeCompleteBadges(week(4, [done]), week(4, [done]))).toEqual(
      []
    );
    expect(programmeCompleteBadges(week(4, [done]), week(1, []))).toEqual([]);
    expect(programmeCompleteBadges(null, week(5, []))).toEqual([]);
  });
});

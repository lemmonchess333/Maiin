/**
 * Unit tests for the pure badge-earning rules (badgeEarning.ts).
 *
 * Before the extraction this logic lived inside the useStreaks effect with no
 * test surface (only badges.ts metadata was tested). These pin the two rule
 * families directly: streak thresholds (incl. multi-threshold crossings +
 * already-earned skip) and the rolling-window balanced badge.
 */
import { describe, it, expect } from "vitest";
import {
  badgesToAward,
  isBalancedEarned,
  maxConsecutiveDayRun,
  earnedBadgeCount,
} from "../badgeEarning";
import type { EarnedBadge } from "../badges";

// Local-midnight anchor so date-fns `format` (local) is tz-stable in the test.
const TODAY = new Date(2026, 4, 20, 12, 0, 0); // 2026-05-20; window = 05-07..05-20

function mkBadge(partial: Partial<EarnedBadge> & { id: string }): EarnedBadge {
  return { earnedAt: null, ...partial } as EarnedBadge;
}

function liftOn(date: string) {
  return { date };
}
function runOn(y: number, m: number, d: number) {
  return { completedAt: { toDate: () => new Date(y, m, d, 12, 0, 0) } };
}

describe("isBalancedEarned", () => {
  const fiveLiftDays = [
    "2026-05-16",
    "2026-05-17",
    "2026-05-18",
    "2026-05-19",
    "2026-05-20",
  ].map(liftOn);
  const fiveRunDays = [16, 17, 18, 19, 20].map((d) => runOn(2026, 4, d));

  it("earns with ≥5 lift-days AND ≥5 run-days in the 14-day window", () => {
    expect(isBalancedEarned(fiveLiftDays, fiveRunDays, TODAY)).toBe(true);
  });

  it("does not earn with only 4 lift-days", () => {
    expect(isBalancedEarned(fiveLiftDays.slice(0, 4), fiveRunDays, TODAY)).toBe(
      false
    );
  });

  it("does not earn with only 4 run-days", () => {
    expect(isBalancedEarned(fiveLiftDays, fiveRunDays.slice(0, 4), TODAY)).toBe(
      false
    );
  });

  it("counts unique days only (duplicates on one day don't help)", () => {
    const dupLifts = [
      "2026-05-20",
      "2026-05-20",
      "2026-05-19",
      "2026-05-18",
      "2026-05-17",
    ].map(liftOn);
    // 4 unique lift days → not earned
    expect(isBalancedEarned(dupLifts, fiveRunDays, TODAY)).toBe(false);
  });

  it("ignores days outside the 14-day window", () => {
    const oldLifts = [
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
    ].map(liftOn);
    expect(isBalancedEarned(oldLifts, fiveRunDays, TODAY)).toBe(false);
  });

  it("skips runs with null / unparseable completedAt", () => {
    const badRuns = [
      { completedAt: null },
      {
        completedAt: {
          toDate: () => {
            throw new Error("bad ts");
          },
        },
      },
      ...fiveRunDays,
    ];
    expect(isBalancedEarned(fiveLiftDays, badRuns, TODAY)).toBe(true);
  });
});

describe("badgesToAward — streak thresholds", () => {
  const badges = [
    mkBadge({ id: "first_day", threshold: 1 }),
    mkBadge({ id: "three_day", threshold: 3 }),
    mkBadge({ id: "week_warrior", threshold: 7 }),
  ];
  const ctx = { workouts: [], runs: [], today: TODAY };

  it("awards nothing below the lowest threshold", () => {
    expect(badgesToAward(badges, { ...ctx, currentStreak: 0 })).toEqual([]);
  });

  it("awards every threshold crossed in a single pass", () => {
    expect(badgesToAward(badges, { ...ctx, currentStreak: 3 })).toEqual([
      "first_day",
      "three_day",
    ]);
  });

  it("awards at the exact threshold boundary", () => {
    expect(badgesToAward(badges, { ...ctx, currentStreak: 7 })).toEqual([
      "first_day",
      "three_day",
      "week_warrior",
    ]);
  });

  it("skips already-earned badges", () => {
    const partlyEarned = [
      mkBadge({
        id: "first_day",
        threshold: 1,
        earnedAt: "2026-01-01T00:00:00Z",
      }),
      mkBadge({ id: "three_day", threshold: 3 }),
    ];
    expect(badgesToAward(partlyEarned, { ...ctx, currentStreak: 5 })).toEqual([
      "three_day",
    ]);
  });
});

describe("badgesToAward — balanced + non-rule badges", () => {
  const fiveLiftDays = [
    "2026-05-16",
    "2026-05-17",
    "2026-05-18",
    "2026-05-19",
    "2026-05-20",
  ].map(liftOn);
  const fiveRunDays = [16, 17, 18, 19, 20].map((d) => runOn(2026, 4, d));

  it("awards balanced when the rolling-window criteria are met", () => {
    const badges = [mkBadge({ id: "balanced" })];
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: fiveLiftDays,
        runs: fiveRunDays,
        today: TODAY,
      })
    ).toEqual(["balanced"]);
  });

  it("does not award balanced when criteria are unmet", () => {
    const badges = [mkBadge({ id: "balanced" })];
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: fiveLiftDays.slice(0, 4),
        runs: fiveRunDays,
        today: TODAY,
      })
    ).toEqual([]);
  });

  it("never awards a no-threshold, non-balanced badge (e.g. unimplemented early_bird)", () => {
    const badges = [mkBadge({ id: "early_bird" })];
    expect(
      badgesToAward(badges, {
        currentStreak: 999,
        workouts: fiveLiftDays,
        runs: fiveRunDays,
        today: TODAY,
      })
    ).toEqual([]);
  });
});

// N consecutive YYYY-MM-DD keys ending on `end` (inclusive), oldest-first.
function consecutiveDates(end: string, n: number): string[] {
  const out: string[] = [];
  const cursor = new Date(end + "T12:00:00");
  for (let i = 0; i < n; i++) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
        cursor.getDate()
      ).padStart(2, "0")}`
    );
    cursor.setDate(cursor.getDate() - 1);
  }
  return out.reverse();
}

describe("maxConsecutiveDayRun", () => {
  it("is 0 for an empty list", () => {
    expect(maxConsecutiveDayRun([])).toBe(0);
  });

  it("counts a single day as a run of 1", () => {
    expect(maxConsecutiveDayRun(["2026-05-20"])).toBe(1);
  });

  it("counts a clean consecutive run", () => {
    expect(maxConsecutiveDayRun(consecutiveDates("2026-05-20", 14))).toBe(14);
  });

  it("resets on a gap and returns the LONGEST run, not the latest", () => {
    const dates = [
      ...consecutiveDates("2026-05-10", 5), // run of 5
      // gap
      ...consecutiveDates("2026-05-20", 3), // run of 3
    ];
    expect(maxConsecutiveDayRun(dates)).toBe(5);
  });

  it("dedupes + sorts unordered input with duplicates", () => {
    expect(
      maxConsecutiveDayRun([
        "2026-05-03",
        "2026-05-01",
        "2026-05-02",
        "2026-05-02",
      ])
    ).toBe(3);
  });

  it("survives a month boundary (calendar-day adjacency, not +1 date math)", () => {
    expect(
      maxConsecutiveDayRun(["2026-04-29", "2026-04-30", "2026-05-01"])
    ).toBe(3);
  });
});

describe("badgesToAward — meal_prep_master (14 days straight)", () => {
  const badges = [mkBadge({ id: "meal_prep_master" })];

  it("awards on a 14-day-straight meal-logging run", () => {
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: [],
        runs: [],
        mealDates: consecutiveDates("2026-05-20", 14),
        today: TODAY,
      })
    ).toEqual(["meal_prep_master"]);
  });

  it("does NOT award at 13 days (strict — no grace, the badge says 'straight')", () => {
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: [],
        runs: [],
        mealDates: consecutiveDates("2026-05-20", 13),
        today: TODAY,
      })
    ).toEqual([]);
  });

  it("does NOT award when a gap breaks the run below 14", () => {
    const broken = [
      ...consecutiveDates("2026-05-07", 10),
      ...consecutiveDates("2026-05-20", 10), // gap between → max run 10
    ];
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: [],
        runs: [],
        mealDates: broken,
        today: TODAY,
      })
    ).toEqual([]);
  });

  it("treats a missing mealDates as no meals (no award)", () => {
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: [],
        runs: [],
        today: TODAY,
      })
    ).toEqual([]);
  });
});

describe("badgesToAward — early_bird (5 days, cumulative)", () => {
  const badges = [mkBadge({ id: "early_bird" })];
  const base = { currentStreak: 0, workouts: [], runs: [], today: TODAY };

  it("awards on 5 distinct early-log days (need not be consecutive)", () => {
    expect(
      badgesToAward(badges, {
        ...base,
        earlyLogDays: [
          "2026-05-01",
          "2026-05-04",
          "2026-05-09",
          "2026-05-15",
          "2026-05-20",
        ],
      })
    ).toEqual(["early_bird"]);
  });

  it("does NOT award at 4 early days", () => {
    expect(
      badgesToAward(badges, {
        ...base,
        earlyLogDays: ["2026-05-01", "2026-05-04", "2026-05-09", "2026-05-15"],
      })
    ).toEqual([]);
  });

  it("treats a missing earlyLogDays as none", () => {
    expect(badgesToAward(badges, base)).toEqual([]);
  });
});

describe("earnedBadgeCount + ultimate_athlete (15 badges)", () => {
  it("counts earned badges but EXCLUDES ultimate_athlete itself", () => {
    const badges = [
      mkBadge({ id: "a", earnedAt: "x" }),
      mkBadge({ id: "b", earnedAt: "x" }),
      mkBadge({ id: "ultimate_athlete", earnedAt: "x" }),
      mkBadge({ id: "c", earnedAt: null }),
    ];
    expect(earnedBadgeCount(badges)).toBe(2);
  });

  // 15 distinct earned badges + the unearned ultimate_athlete.
  const fifteenEarned = Array.from({ length: 15 }, (_, i) =>
    mkBadge({ id: `b${i}`, earnedAt: "2026-01-01" })
  );

  it("awards ultimate_athlete once 15 OTHER badges are earned", () => {
    const badges = [...fifteenEarned, mkBadge({ id: "ultimate_athlete" })];
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: [],
        runs: [],
        today: TODAY,
      })
    ).toEqual(["ultimate_athlete"]);
  });

  it("does NOT award at 14 earned (the meta-badge can't self-satisfy)", () => {
    const badges = [
      ...fifteenEarned.slice(0, 14),
      mkBadge({ id: "ultimate_athlete" }),
    ];
    expect(
      badgesToAward(badges, {
        currentStreak: 0,
        workouts: [],
        runs: [],
        today: TODAY,
      })
    ).toEqual([]);
  });
});

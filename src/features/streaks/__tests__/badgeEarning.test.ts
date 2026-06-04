/**
 * Unit tests for the pure badge-earning rules (badgeEarning.ts).
 *
 * Before the extraction this logic lived inside the useStreaks effect with no
 * test surface (only badges.ts metadata was tested). These pin the two rule
 * families directly: streak thresholds (incl. multi-threshold crossings +
 * already-earned skip) and the rolling-window balanced badge.
 */
import { describe, it, expect } from "vitest";
import { badgesToAward, isBalancedEarned } from "../badgeEarning";
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

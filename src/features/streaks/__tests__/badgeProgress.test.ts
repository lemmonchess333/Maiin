/**
 * Unit tests for badgeProgress.ts (the goal-gradient progress engine) + the
 * newly-earnable hybrid-frequency rules in badgeEarning.ts.
 */
import { describe, it, expect } from "vitest";
import { badgeProgress, nearestBadge } from "../badgeProgress";
import { badgesToAward } from "../badgeEarning";
import type { BadgeDef, EarnedBadge } from "../badges";

// Local-midday anchor so date-fns `format` (local) is tz-stable.
const TODAY = new Date(2026, 4, 20, 12, 0, 0); // 2026-05-20

function def(partial: Partial<BadgeDef> & { id: string }): BadgeDef {
  return {
    name: partial.id,
    description: "",
    icon: "",
    lucideIcon: "Trophy",
    tier: "bronze",
    category: "consistency",
    ...partial,
  } as BadgeDef;
}
const liftOn = (date: string) => ({ date });
const runOn = (d: number) => ({
  completedAt: { toDate: () => new Date(2026, 4, d, 12, 0, 0) },
});
function ctx(over: Partial<Parameters<typeof badgeProgress>[1]> = {}) {
  return { currentStreak: 0, workouts: [], runs: [], today: TODAY, ...over };
}

describe("badgeProgress", () => {
  it("streak badge → current/target/label + fractional pct", () => {
    const p = badgeProgress(
      def({ id: "week_warrior", threshold: 7 }),
      ctx({ currentStreak: 5 })
    );
    expect(p).toMatchObject({ current: 5, target: 7, label: "5 / 7 days" });
    expect(p?.pct).toBeCloseTo(5 / 7);
  });

  it("streak badge caps current + pct at the threshold", () => {
    const p = badgeProgress(
      def({ id: "week_warrior", threshold: 7 }),
      ctx({ currentStreak: 12 })
    );
    expect(p?.current).toBe(7);
    expect(p?.pct).toBe(1);
  });

  it("balanced → combined lift+run progress in 14d", () => {
    const p = badgeProgress(
      def({ id: "balanced", category: "hybrid" }),
      ctx({
        workouts: ["2026-05-20", "2026-05-19", "2026-05-18"].map(liftOn),
        runs: [20, 19].map(runOn),
      })
    );
    expect(p?.label).toBe("3/5 lifts · 2/5 runs");
    expect(p?.pct).toBeCloseTo(0.5);
  });

  it("hybrid_athlete → a lift + a run this week is complete", () => {
    const p = badgeProgress(
      def({ id: "hybrid_athlete", category: "hybrid" }),
      ctx({ workouts: [liftOn("2026-05-20")], runs: [runOn(19)] })
    );
    expect(p?.pct).toBe(1);
  });

  it("iron_runner → 3 lifts + 2 runs = 5/6", () => {
    const p = badgeProgress(
      def({ id: "iron_runner", category: "hybrid" }),
      ctx({
        workouts: ["2026-05-20", "2026-05-19", "2026-05-18"].map(liftOn),
        runs: [20, 19].map(runOn),
      })
    );
    expect(p?.current).toBe(5);
    expect(p?.target).toBe(6);
  });

  it("meal_prep_master → longest consecutive meal-logged run vs 14", () => {
    const p = badgeProgress(
      def({ id: "meal_prep_master", category: "nutrition" }),
      ctx({
        mealDates: [
          "2026-05-12",
          "2026-05-13",
          "2026-05-14",
          "2026-05-15", // run of 4
        ],
      })
    );
    expect(p).toMatchObject({
      current: 4,
      target: 14,
      label: "4 / 14 days logged",
    });
    expect(p?.pct).toBeCloseTo(4 / 14);
  });

  it("meal_prep_master caps current + pct at 14", () => {
    const long = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(2026, 4, 1 + i, 12);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    });
    const p = badgeProgress(
      def({ id: "meal_prep_master", category: "nutrition" }),
      ctx({ mealDates: long })
    );
    expect(p?.current).toBe(14);
    expect(p?.pct).toBe(1);
  });

  it("early_bird → distinct early-log days vs 5", () => {
    const p = badgeProgress(
      def({ id: "early_bird", category: "consistency" }),
      ctx({ earlyLogDays: ["2026-05-01", "2026-05-10", "2026-05-20"] })
    );
    expect(p).toMatchObject({
      current: 3,
      target: 5,
      label: "3 / 5 early days",
    });
  });

  it("ultimate_athlete → earned badge tally vs 15", () => {
    const p = badgeProgress(
      def({ id: "ultimate_athlete", category: "hybrid" }),
      ctx({ earnedBadgeCount: 9 })
    );
    expect(p).toMatchObject({
      current: 9,
      target: 15,
      label: "9 / 15 badges",
    });
    expect(p?.pct).toBeCloseTo(9 / 15);
  });

  it("returns null for milestone + target-dependent nutrition badges", () => {
    expect(
      badgeProgress(def({ id: "first_5k", category: "running" }), ctx())
    ).toBeNull();
    expect(
      badgeProgress(def({ id: "protein_pro", category: "nutrition" }), ctx())
    ).toBeNull();
    expect(
      badgeProgress(def({ id: "triple_threat", category: "hybrid" }), ctx())
    ).toBeNull();
  });
});

describe("nearestBadge", () => {
  it("picks the highest strictly-in-progress badge, skips earned", () => {
    const badges = [
      {
        id: "three_day",
        earnedAt: null,
        def: def({ id: "three_day", threshold: 3 }),
      },
      {
        id: "week_warrior",
        earnedAt: null,
        def: def({ id: "week_warrior", threshold: 7 }),
      },
      {
        id: "first_step",
        earnedAt: "x",
        def: def({ id: "first_step", threshold: 1 }),
      },
    ];
    // currentStreak 2 → three_day 2/3, week_warrior 2/7 → three_day is nearest.
    expect(nearestBadge(badges, ctx({ currentStreak: 2 }))?.def.id).toBe(
      "three_day"
    );
  });

  it("ignores not-started (pct 0) and complete (pct ≥ 1)", () => {
    const badges = [
      {
        id: "three_day",
        earnedAt: null,
        def: def({ id: "three_day", threshold: 3 }),
      },
    ];
    expect(nearestBadge(badges, ctx({ currentStreak: 0 }))).toBeNull();
    expect(nearestBadge(badges, ctx({ currentStreak: 9 }))).toBeNull();
  });
});

describe("badgesToAward — hybrid-frequency badges (now earnable)", () => {
  const badges = [
    { id: "hybrid_athlete", earnedAt: null } as EarnedBadge,
    { id: "iron_runner", earnedAt: null } as EarnedBadge,
  ];

  it("awards hybrid_athlete on a lift + a run within the week", () => {
    const r = badgesToAward(badges, {
      currentStreak: 0,
      workouts: [liftOn("2026-05-20")],
      runs: [runOn(19)],
      today: TODAY,
    });
    expect(r).toContain("hybrid_athlete");
    expect(r).not.toContain("iron_runner");
  });

  it("awards iron_runner with 3 lifts + 3 runs in the week", () => {
    const r = badgesToAward(badges, {
      currentStreak: 0,
      workouts: ["2026-05-20", "2026-05-19", "2026-05-18"].map(liftOn),
      runs: [20, 19, 18].map(runOn),
      today: TODAY,
    });
    expect(r).toContain("iron_runner");
    expect(r).toContain("hybrid_athlete");
  });
});

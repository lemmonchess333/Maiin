/**
 * Cross-test: the app's badge progress IS the server's badge award
 * (ADR-0008 — pin the running copies against each other, not prose).
 *
 * Every badge is awarded by the server (App1 Q33): `functions/lib/
 * badgeRules.js` decides, from the facts a trigger reads. The app still
 * draws a ring and "X / Y" for a badge in progress (`badgeProgress.ts`),
 * from its own copy of the windows, runs of days and thresholds
 * (`badgeEarning.ts`, `earlyLogDays.ts`, `nutritionBadgeDays.ts`,
 * `waterUnits.ts`). Two copies of one rule is this repo's first recurring
 * mistake, and here both halves are on screen at once: a ring that fills to
 * 10/10 without the badge, or a badge that lands at 8/10, is a visible
 * contradiction on the badge grid.
 *
 * So, against the server module loaded through createRequire:
 *   1. the biconditional — for a population of fact sets crossing every
 *      threshold, a ring is full exactly when the server's rules award;
 *   2. each shared piece on its own: the run of consecutive days, the
 *      nutrition join, the water units, the early hour in this process's
 *      timezone (CI runs it in three), the kept early days, the cycle's
 *      last week.
 *
 * This file was `badgeProgressEarningParity.test.ts`, which held progress
 * to the client's own award rules; those were the copy that ran until the
 * server took the awards over.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { badgeProgress } from "../badgeProgress";
import {
  maxConsecutiveDayRun,
  type BadgeEarningContext,
} from "../badgeEarning";
import { BADGE_DEFINITIONS } from "../badges";
import { earlyDaysOf, keptEarlyDays, EARLY_HOUR } from "../earlyLogDays";
import {
  computeNutritionBadgeDays,
  MACRO_TARGET_BAND,
  type DayMacros,
  type DayWater,
} from "@/lib/nutritionBadgeDays";
import { resolveConsumedMl, resolveTargetMl } from "@/lib/waterUnits";
import { isCycleEndWeek } from "@/features/program/weekPrescription";

const require_ = createRequire(import.meta.url);
const server = require_("../../../../functions/lib/badgeRules") as {
  streakBadges: (days: number) => string[];
  hybridBadges: (
    liftDays: Iterable<string>,
    runDays: Iterable<string>,
    focusDay: string
  ) => string[];
  maxConsecutiveDayRun: (days: Iterable<string>) => number;
  mealPrepBadges: (days: Iterable<string>) => string[];
  nutritionBadgeDays: (
    meals: Map<string, DayMacros>,
    targets: Map<string, DayMacros>,
    water: Map<string, DayWater>
  ) => {
    macroMasterDays: string[];
    proteinHitDays: string[];
    waterHitDays: string[];
  };
  nutritionBadges: (
    days: {
      macroMasterDays?: string[];
      proteinHitDays?: string[];
      waterHitDays?: string[];
    },
    liftDays: Iterable<string>,
    runDays: Iterable<string>
  ) => string[];
  waterConsumedMl: (raw: unknown) => number;
  waterTargetMl: (raw: unknown) => number;
  earlyDayOf: (atMs: number, timezone: string | null) => string | null;
  keptEarlyDays: (...sources: (readonly string[] | undefined)[]) => string[];
  earlyBirdBadges: (days: Iterable<string>) => string[];
  ultimateAthleteDue: (earnedIds: readonly string[]) => boolean;
  isCycleEndWeek: (week: number) => boolean;
  MACRO_TARGET_BAND: number;
  EARLY_HOUR: number;
};

/** Local-midday anchor so date-fns `format` (local) is tz-stable. */
const TODAY = new Date(2026, 4, 20, 12, 0, 0); // 2026-05-20

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Local date keys for days `from`..`to` ago, inclusive. */
function daysAgo(from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

/** N consecutive local date keys ending today. */
function recentDays(n: number): string[] {
  return n <= 0 ? [] : daysAgo(0, n - 1);
}

function runsOn(dates: string[]) {
  return dates.map((day) => ({ day }));
}

/**
 * A population spanning the interesting region of every fact the rules
 * read — nothing, a little, just under each threshold, and comfortably
 * over. The point is to cross every boundary rather than to be exhaustive.
 */
function contexts(): BadgeEarningContext[] {
  const out: BadgeEarningContext[] = [];
  for (const days of [0, 1, 6, 7, 13, 14, 20, 30, 60, 100, 365]) {
    for (const streak of [0, 1, 6, 7, 29, 30, 100]) {
      const dates = recentDays(days);
      out.push({
        today: TODAY,
        currentStreak: streak,
        workouts: dates.map((date) => ({ date })),
        runs: runsOn(dates),
        mealDates: dates,
        earlyLogDays: dates.slice(0, 5),
        earnedBadgeCount: Math.min(days, 16),
        macroMasterDays: dates,
        proteinHitDays: dates,
        waterHitDays: dates,
      });
    }
  }
  // Asymmetric shapes: one discipline only, and meals without training.
  for (const days of [0, 5, 10, 30]) {
    const dates = recentDays(days);
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: dates.map((date) => ({ date })),
      runs: [],
      mealDates: [],
      earlyLogDays: [],
      earnedBadgeCount: 0,
    });
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: [],
      runs: runsOn(dates),
      mealDates: [],
      earlyLogDays: [],
      earnedBadgeCount: 0,
    });
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: [],
      runs: [],
      mealDates: dates,
      earlyLogDays: dates.slice(0, 5),
      earnedBadgeCount: 0,
    });
  }
  /* Lifts and runs in DIFFERENT numbers. Every context above has as many
     run days as lift days, or none of one, so a hybrid rule that asked for
     one fewer run than lifts passed the sweep until these were added. */
  for (const lifts of [0, 1, 2, 3, 4, 5, 7]) {
    for (const runCount of [0, 1, 2, 3, 4, 5, 7]) {
      out.push({
        today: TODAY,
        currentStreak: 0,
        workouts: recentDays(lifts).map((date) => ({ date })),
        runs: runsOn(daysAgo(1, runCount)),
        mealDates: [],
        earlyLogDays: [],
        earnedBadgeCount: 0,
      });
    }
  }
  /* STALE-ACTIVITY shapes. Every context above puts training on
     consecutive days ending TODAY, and there a 7-day window and a 14-day
     window agree for any recent session, so a rule that widened one of
     them would go unnoticed (widening hybrid_athlete's window from 7 to 14
     days passed the whole sweep until these were added). These put
     activity only in bands inside the 14-day windows and outside the 7-day
     ones. */
  for (const [from, to] of [
    [7, 13],
    [8, 20],
    [3, 9],
    [10, 30],
  ]) {
    const dates = daysAgo(from, to);
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: dates.map((date) => ({ date })),
      runs: runsOn(dates),
      mealDates: dates,
      earlyLogDays: dates.slice(0, 5),
      earnedBadgeCount: 0,
      macroMasterDays: dates,
      proteinHitDays: dates,
      waterHitDays: dates,
    });
    // …and the same band with only ONE discipline present.
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: dates.map((date) => ({ date })),
      runs: [],
      mealDates: [],
      earlyLogDays: [],
      earnedBadgeCount: 0,
    });
  }
  return out;
}

const CONTEXTS = contexts();

/** What the server awards from a context's facts, as its triggers see them
 *  when the day of the newest fact is today. */
function serverAwards(ctx: BadgeEarningContext): Set<string> {
  const today = dateKey(ctx.today);
  const liftDays = ctx.workouts.map((w) => w.date);
  const runDays = ctx.runs.map((r) => r.day);
  const earned = Array.from(
    { length: ctx.earnedBadgeCount ?? 0 },
    (_, i) => `earned_${i}`
  );
  return new Set([
    ...server.streakBadges(ctx.currentStreak),
    ...server.hybridBadges(liftDays, runDays, today),
    ...server.mealPrepBadges(ctx.mealDates ?? []),
    ...server.earlyBirdBadges(ctx.earlyLogDays ?? []),
    ...server.nutritionBadges(
      {
        macroMasterDays: ctx.macroMasterDays,
        proteinHitDays: ctx.proteinHitDays,
        waterHitDays: ctx.waterHitDays,
      },
      liftDays,
      runDays
    ),
    ...(server.ultimateAthleteDue(earned) ? ["ultimate_athlete"] : []),
  ]);
}

describe("a badge's ring is full exactly when the server awards it", () => {
  it("drives a population large enough to cross every threshold", () => {
    // Guards the guard: a sweep that silently shrank to nothing would make
    // every assertion below vacuous.
    expect(CONTEXTS.length).toBeGreaterThan(80);
    expect(BADGE_DEFINITIONS.length).toBeGreaterThan(10);
  });

  it("pct >= 1 exactly when the server awards", () => {
    /* Both directions fail differently:
         pct >= 1 but not awarded  → a full ring that never pays out
         awarded but pct < 1       → a badge that lands early, ring half-full */
    const disagreements: string[] = [];
    for (const ctx of CONTEXTS) {
      const awarded = serverAwards(ctx);
      for (const badge of BADGE_DEFINITIONS) {
        const p = badgeProgress(badge, ctx);
        if (!p) continue; // no ring is drawn for it
        const complete = p.pct >= 1;
        if (complete !== awarded.has(badge.id)) {
          disagreements.push(
            `${badge.id}: pct=${p.pct.toFixed(3)} (${p.current}/${p.target}) ` +
              `awarded=${awarded.has(badge.id)} streak=${ctx.currentStreak} ` +
              `workouts=${ctx.workouts.length} runs=${ctx.runs.length}`
          );
        }
      }
    }
    expect(disagreements.slice(0, 10)).toEqual([]);
  });

  it("exercises BOTH sides of that biconditional", () => {
    /* `complete === awarded` is satisfied by a world where nothing is ever
       either. The sweep must produce full-and-awarded pairs AND
       short-and-unawarded ones, for a spread of distinct badges. */
    let bothTrue = 0;
    let bothFalse = 0;
    const completedIds = new Set<string>();
    for (const ctx of CONTEXTS) {
      const awarded = serverAwards(ctx);
      for (const badge of BADGE_DEFINITIONS) {
        const p = badgeProgress(badge, ctx);
        if (!p) continue;
        if (p.pct >= 1 && awarded.has(badge.id)) {
          bothTrue++;
          completedIds.add(badge.id);
        }
        if (p.pct < 1 && !awarded.has(badge.id)) bothFalse++;
      }
    }
    expect(bothTrue).toBeGreaterThan(20);
    expect(bothFalse).toBeGreaterThan(20);
    expect(completedIds.size).toBeGreaterThan(8);
  });

  it("never reports progress past its own target", () => {
    for (const ctx of CONTEXTS) {
      for (const badge of BADGE_DEFINITIONS) {
        const p = badgeProgress(badge, ctx);
        if (!p) continue;
        expect(p.current).toBeLessThanOrEqual(p.target);
        expect(p.pct).toBeGreaterThanOrEqual(0);
        expect(p.pct).toBeLessThanOrEqual(1);
      }
    }
  });

  it("draws a ring for most of the catalogue, not almost none of it", () => {
    // A regression that returned null everywhere would make the parity
    // above pass by having nothing to compare.
    const rich = CONTEXTS[CONTEXTS.length - 12];
    const withProgress = BADGE_DEFINITIONS.filter((b) =>
      badgeProgress(b, rich)
    );
    expect(withProgress.length).toBeGreaterThan(BADGE_DEFINITIONS.length * 0.4);
  });
});

describe("the shared pieces, one at a time", () => {
  it("the run of consecutive days, across month ends and the clock changes", () => {
    const fixtures: string[][] = [
      [],
      ["2026-05-20"],
      ["2026-04-29", "2026-04-30", "2026-05-01"],
      // UK and US clock changes, and the southern ones.
      ["2026-03-28", "2026-03-29", "2026-03-30"],
      ["2026-10-24", "2026-10-25", "2026-10-26"],
      ["2026-03-07", "2026-03-08", "2026-03-09"],
      ["2026-04-04", "2026-04-05", "2026-04-06", "2026-09-26", "2026-09-27"],
      ["2026-05-03", "2026-05-01", "2026-05-02", "2026-05-02"],
      ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-03"],
      ["2028-02-28", "2028-02-29", "2028-03-01"],
    ];
    for (const days of fixtures) {
      expect(server.maxConsecutiveDayRun(days), days.join()).toBe(
        maxConsecutiveDayRun(days)
      );
    }
  });

  it("the nutrition join: the same hit days from the same totals and targets", () => {
    expect(server.MACRO_TARGET_BAND).toBe(MACRO_TARGET_BAND);
    const target = { protein: 150, carbs: 250, fat: 70 };
    const meals = new Map<string, DayMacros>([
      ["2026-05-01", { protein: 150, carbs: 250, fat: 70 }], // every macro
      ["2026-05-02", { protein: 157.5, carbs: 237.5, fat: 73.5 }], // ±5% edges
      ["2026-05-03", { protein: 158, carbs: 250, fat: 70 }], // protein over 5%
      ["2026-05-04", { protein: 149, carbs: 250, fat: 70 }], // protein short
      ["2026-05-05", { protein: 200, carbs: 100, fat: 20 }], // protein only
      ["2026-05-06", { protein: 150, carbs: 250, fat: 70 }], // no target
      ["2026-05-07", { protein: 0, carbs: 0, fat: 0 }],
      ["2026-05-08", { protein: 10, carbs: 10, fat: 10 }], // zero target
    ]);
    const targets = new Map<string, DayMacros>(
      [...meals.keys()]
        .filter((d) => d !== "2026-05-06")
        .map((d) => [
          d,
          d === "2026-05-08" ? { protein: 0, carbs: 0, fat: 0 } : target,
        ])
    );
    const water = new Map<string, DayWater>([
      ["2026-05-01", { ml: 2000, target: 2000 }],
      ["2026-05-02", { ml: 1999, target: 2000 }],
      ["2026-05-03", { ml: 2500, target: 0 }],
      ["2026-05-04", { ml: 3000, target: 2500 }],
    ]);
    const client = computeNutritionBadgeDays(meals, targets, water);
    expect(server.nutritionBadgeDays(meals, targets, water)).toEqual(client);
    // Not agreeing about nothing.
    expect(client.macroMasterDays.length).toBeGreaterThan(1);
    expect(client.proteinHitDays.length).toBeGreaterThan(2);
    expect(client.waterHitDays.length).toBeGreaterThan(1);
  });

  it("the water units: millilitres and the target, legacy glasses included", () => {
    const docs: Record<string, unknown>[] = [
      {},
      { ml: 750, targetMl: 2500 },
      { ml: -5, targetMl: 0 },
      { ml: 312.6 },
      { glasses: 6 },
      { glasses: 6, ml: 0 },
      { targetGlasses: 10 },
      { targetWaterGlasses: 9 },
      { targetMl: Infinity, targetGlasses: 8 },
      { ml: Number.NaN, glasses: 3 },
      { ml: "500", targetMl: "3000" },
    ];
    for (const raw of docs) {
      expect(server.waterConsumedMl(raw), JSON.stringify(raw)).toBe(
        resolveConsumedMl(raw)
      );
      expect(server.waterTargetMl(raw), JSON.stringify(raw)).toBe(
        resolveTargetMl(raw)
      );
    }
  });

  it("the early hour, in this process's timezone", () => {
    expect(server.EARLY_HOUR).toBe(EARLY_HOUR);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Every hour of days either side of the clock changes.
    const times: Date[] = [];
    for (const day of [
      new Date(2026, 2, 28),
      new Date(2026, 2, 29),
      new Date(2026, 3, 5),
      new Date(2026, 9, 25),
      TODAY,
    ]) {
      for (let h = 0; h < 24; h++) {
        const at = new Date(day);
        at.setHours(h, 30, 0, 0);
        times.push(at);
      }
    }
    for (const at of times) {
      expect(server.earlyDayOf(at.getTime(), tz), at.toISOString()).toBe(
        earlyDaysOf([at])[0] ?? null
      );
    }
    expect(times.some((at) => earlyDaysOf([at]).length === 1)).toBe(true);
  });

  it("the kept early days: distinct, earliest first, five at most", () => {
    const sources: (readonly string[] | undefined)[][] = [
      [undefined, []],
      [["2026-05-03"], ["2026-05-01", "2026-05-03"]],
      [
        ["2026-05-09", "2026-05-01", "2026-05-05"],
        ["2026-05-02", "2026-05-08", "2026-05-03", "2026-05-01"],
      ],
    ];
    for (const s of sources) {
      expect(server.keptEarlyDays(...s)).toEqual(keptEarlyDays(...s));
    }
  });

  it("a cycle's last week", () => {
    for (let week = -1; week <= 60; week++) {
      expect(server.isCycleEndWeek(week), String(week)).toBe(
        isCycleEndWeek(week)
      );
    }
  });
});

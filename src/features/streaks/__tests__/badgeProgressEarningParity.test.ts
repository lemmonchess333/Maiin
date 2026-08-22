/**
 * The invariant `badgeProgress.ts` claims about itself, actually asserted.
 *
 * Its header says progress "reuses `activeDayCounts` from ./badgeEarning so
 * progress and earning never disagree (earned ⇔ pct >= 1 for every badge that
 * has progress here)". Nothing checked it. The existing progress tests assert
 * individual fractions (5/7, 4/14, 9/15) and the earning tests assert
 * individual awards, but no test drove BOTH from the same context and compared
 * them — which is precisely the arrangement in which two modules drift while
 * every test stays green.
 *
 * It matters to the user more than most invariants of this kind, because both
 * halves are on screen at once. A ring that fills to 10/10 without awarding,
 * or a badge that awards at 8/10, is a visible contradiction on the badge grid
 * rather than a subtle scoring error.
 *
 * The sweep drives the REAL catalogue (`BADGE_DEFINITIONS`) rather than
 * hand-built defs, so a badge added later is covered the day it lands. Badges
 * whose progress is deliberately uncomputable client-side return `null` from
 * `badgeProgress` and are skipped — that exclusion is itself asserted below,
 * so "return null for everything" cannot pass this file.
 */
import { describe, it, expect } from "vitest";
import { badgeProgress } from "../badgeProgress";
import { badgesToAward, type BadgeEarningContext } from "../badgeEarning";
import { BADGE_DEFINITIONS, type EarnedBadge } from "../badges";

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
  return dates.map((key) => {
    const [y, m, d] = key.split("-").map(Number);
    const at = new Date(y, m - 1, d, 12, 0, 0);
    return { completedAt: { toDate: () => at } };
  });
}

/**
 * A population spanning the interesting region of every input the earning
 * rules read — nothing, a little, just under each threshold, and comfortably
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
        earlyLogDays: dates,
        earnedBadgeCount: Math.min(days, 12),
        macroMasterDays: dates,
        proteinHitDays: dates,
        waterHitDays: dates,
      } as BadgeEarningContext);
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
    } as BadgeEarningContext);
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: [],
      runs: runsOn(dates),
      mealDates: [],
      earlyLogDays: [],
      earnedBadgeCount: 0,
    } as BadgeEarningContext);
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: [],
      runs: [],
      mealDates: dates,
      earlyLogDays: dates,
      earnedBadgeCount: 0,
    } as BadgeEarningContext);
  }
  /* STALE-ACTIVITY shapes, and the reason they exist. Every context above
     puts training on consecutive days ending TODAY — and in that arrangement
     a 7-day window and a 14-day window agree for any user with a single
     recent session, so a rule that widened one of them would go unnoticed.
     Proven, not assumed: widening `hybrid_athlete`'s progress window from 7
     to 14 days passed the whole sweep until these were added.

     These put activity ONLY in the 8-14-day band, which is inside the
     balanced/meal-prep windows and outside the hybrid-frequency one, so the
     two windows disagree and any drift between them is visible. */
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
      earlyLogDays: dates,
      earnedBadgeCount: 0,
      macroMasterDays: dates,
      proteinHitDays: dates,
      waterHitDays: dates,
    } as BadgeEarningContext);
    // …and the same band with only ONE discipline present.
    out.push({
      today: TODAY,
      currentStreak: 0,
      workouts: dates.map((date) => ({ date })),
      runs: [],
      mealDates: [],
      earlyLogDays: [],
      earnedBadgeCount: 0,
    } as BadgeEarningContext);
  }

  return out;
}

const CONTEXTS = contexts();

/** Every badge, unearned, so `badgesToAward` considers all of them. */
const unearned = (): EarnedBadge[] =>
  BADGE_DEFINITIONS.map(
    (d) => ({ ...d, earnedAt: null }) as unknown as EarnedBadge
  );

describe("badge progress and earning never disagree", () => {
  it("drives a population large enough to cross every threshold", () => {
    // Guards the guard: a sweep that silently shrank to nothing would make
    // every assertion below vacuous.
    expect(CONTEXTS.length).toBeGreaterThan(80);
    expect(BADGE_DEFINITIONS.length).toBeGreaterThan(10);
  });

  it("pct >= 1 exactly when the badge is awarded", () => {
    /* The biconditional the header asserts. Both directions matter and fail
       differently:
         pct >= 1 but not awarded  → a full ring that never pays out
         awarded but pct < 1       → a badge that fires early, ring half-full */
    const disagreements: string[] = [];

    for (const ctx of CONTEXTS) {
      const awarded = new Set(badgesToAward(unearned(), ctx));
      for (const badge of BADGE_DEFINITIONS) {
        const p = badgeProgress(badge, ctx);
        if (!p) continue; // earns server-side; no ring is rendered
        const complete = p.pct >= 1;
        const isAwarded = awarded.has(badge.id);
        if (complete !== isAwarded) {
          disagreements.push(
            `${badge.id}: pct=${p.pct.toFixed(3)} (${p.current}/${p.target}) ` +
              `awarded=${isAwarded} streak=${ctx.currentStreak} ` +
              `workouts=${ctx.workouts.length} runs=${ctx.runs.length}`
          );
        }
      }
    }

    expect(disagreements.slice(0, 10)).toEqual([]);
  });

  it("exercises BOTH sides of that biconditional", () => {
    /* The assertion above is `complete === isAwarded`, which a world where
       nothing is ever complete and nothing is ever awarded satisfies
       perfectly. This is the guard that makes it mean something: the sweep
       must actually produce completed-and-awarded pairs AND
       incomplete-and-unawarded ones, for a decent spread of DISTINCT badges,
       or the parity test is agreeing about the empty set. */
    let bothTrue = 0;
    let bothFalse = 0;
    const completedIds = new Set<string>();

    for (const ctx of CONTEXTS) {
      const awarded = new Set(badgesToAward(unearned(), ctx));
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
    // Not one chatty badge carrying the whole positive side.
    expect(completedIds.size).toBeGreaterThan(4);
  });

  it("never reports progress past its own target", () => {
    // `current` is documented as clamped; an unclamped value would render
    // "17 / 14 days" on the grid.
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

  it("computes progress for most of the catalogue, not almost none of it", () => {
    /* The exclusion is real (lifetime distance, PRs and some nutrition badges
       earn server-side) but it must stay an exception. Without this, a
       regression that returned null everywhere would make the parity test
       above pass by having nothing to compare. */
    const rich = CONTEXTS[CONTEXTS.length - 12];
    const withProgress = BADGE_DEFINITIONS.filter((b) =>
      badgeProgress(b, rich)
    );
    expect(withProgress.length).toBeGreaterThan(BADGE_DEFINITIONS.length * 0.4);
  });
});

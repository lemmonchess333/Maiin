/**
 * Badge-earning rules — the pure decision of "which not-yet-earned badges does
 * this user qualify for right now?".
 *
 * Extracted from the `useStreaks` effect (which previously inlined two async
 * closures + a file-local `isBalancedEarned`) so the earning RULES have one
 * home and a direct test surface, separate from the `awardBadge` Firestore I/O.
 * The hook stays responsible for WHEN to check and HOW to persist; this module
 * owns WHAT qualifies.
 *
 * Two rule families today:
 *  - **streak-threshold** badges (`BadgeDef.threshold` days): earned once
 *    `currentStreak >= threshold`.
 *  - **balanced** (`id === "balanced"`): ≥5 lift-days AND ≥5 run-days within a
 *    rolling 14-day window.
 *
 * A no-threshold badge that isn't `balanced` (e.g. the not-yet-implemented
 * `early_bird`) simply never qualifies here — matching the prior behaviour.
 * Adding a new rule is now a single edit in `badgesToAward`.
 */

import { format } from "date-fns";
import type { EarnedBadge } from "./badges";

/** Minimal structural shapes — kept local so this module doesn't depend on the
 *  hook (which imports it). useStreaks' WorkoutRow / RunRow are assignable. */
export interface BalancedWorkout {
  date: string;
}
export interface BalancedRun {
  completedAt: { toDate: () => Date } | null;
}

export interface BadgeEarningContext {
  currentStreak: number;
  workouts: BalancedWorkout[];
  runs: BalancedRun[];
  /**
   * Distinct YYYY-MM-DD dates on which the user logged at least one meal item.
   * Threaded from the streak hook's meals subscription. Optional so existing
   * callers/tests that predate the nutrition rules still type-check (treated as
   * "no meals logged"). Drives `meal_prep_master`.
   */
  mealDates?: string[];
  /** "Now" — threaded in so the rolling-window rule is pure/testable. */
  today: Date;
}

/** "Log all meals for 14 days straight" — strict, no grace (the badge says
 *  *straight*, unlike the grace-forgiven activity streak). */
export const MEAL_PREP_RUN_DAYS = 14;

/**
 * The longest run of CONSECUTIVE calendar days within a set of YYYY-MM-DD keys.
 * Pure; dedupes + sorts internally so callers can pass raw date lists. The
 * adjacency test steps a noon-anchored Date back one calendar day (DST-safe,
 * matching the streak walk) rather than subtracting milliseconds.
 */
export function maxConsecutiveDayRun(dates: Iterable<string>): number {
  const unique = Array.from(new Set(dates)).filter(Boolean).sort();
  if (unique.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    const prevDay = new Date(unique[i] + "T12:00:00");
    prevDay.setDate(prevDay.getDate() - 1);
    if (format(prevDay, "yyyy-MM-dd") === unique[i - 1]) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  return longest;
}

/** Unique lift-days and run-days within the inclusive `days`-day window ending
 *  today. Shared by the balanced (14d) + hybrid-frequency (7d) rules and by
 *  badgeProgress, so the window logic has one home. */
export function activeDayCounts(
  workouts: BalancedWorkout[],
  runs: BalancedRun[],
  today: Date,
  days: number
): { liftDays: number; runDays: number } {
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (days - 1)); // inclusive
  const startKey = format(windowStart, "yyyy-MM-dd");
  const endKey = format(today, "yyyy-MM-dd");
  const inWindow = (d: string) => d >= startKey && d <= endKey;

  const liftDays = new Set<string>();
  for (const w of workouts) {
    if (typeof w.date === "string" && inWindow(w.date)) liftDays.add(w.date);
  }

  const runDays = new Set<string>();
  for (const r of runs) {
    if (!r.completedAt) continue;
    try {
      const d = format(r.completedAt.toDate(), "yyyy-MM-dd");
      if (inWindow(d)) runDays.add(d);
    } catch {
      // unparseable timestamp — skip
    }
  }

  return { liftDays: liftDays.size, runDays: runDays.size };
}

/** ≥5 lift-days AND ≥5 run-days within the inclusive 14-day window ending today. */
export function isBalancedEarned(
  workouts: BalancedWorkout[],
  runs: BalancedRun[],
  today: Date
): boolean {
  const { liftDays, runDays } = activeDayCounts(workouts, runs, today, 14);
  return liftDays >= 5 && runDays >= 5;
}

/**
 * The ids of badges the user newly qualifies for. Already-earned badges
 * (`earnedAt` set) are skipped. Returns all qualifying ids in one pass, so a
 * multi-threshold streak jump awards every crossed tier at once.
 */
export function badgesToAward(
  badges: EarnedBadge[],
  ctx: BadgeEarningContext
): string[] {
  const ids: string[] = [];
  for (const b of badges) {
    if (b.earnedAt) continue;

    // Streak-threshold badges.
    if (typeof b.threshold === "number" && b.threshold > 0) {
      if (ctx.currentStreak >= b.threshold) ids.push(b.id);
      continue;
    }

    // Rolling-window balanced badge (5 lift-days + 5 run-days in 14d).
    if (b.id === "balanced") {
      if (isBalancedEarned(ctx.workouts, ctx.runs, ctx.today)) ids.push(b.id);
      continue;
    }

    // Hybrid-frequency badges — a lift AND a run within the rolling 7-day
    // window. Recent-window (not lifetime), so accurate from the client's
    // windowed snapshots. These were previously unearnable (dead).
    if (b.id === "hybrid_athlete") {
      const { liftDays, runDays } = activeDayCounts(
        ctx.workouts,
        ctx.runs,
        ctx.today,
        7
      );
      if (liftDays >= 1 && runDays >= 1) ids.push(b.id);
      continue;
    }
    if (b.id === "iron_runner") {
      const { liftDays, runDays } = activeDayCounts(
        ctx.workouts,
        ctx.runs,
        ctx.today,
        7
      );
      if (liftDays >= 3 && runDays >= 3) ids.push(b.id);
      continue;
    }

    // Meal Prep Master — a meal logged on every day of a 14-day-straight run.
    // Recent-window (14d ≪ the 500-doc meal window), so accurate from the
    // client's snapshots — no targets involved, just logged-or-not. The other
    // three nutrition badges (macro_master / protein_pro / hydration_hero) need
    // per-historical-day macro/water TARGETS and earn server-side (a follow-up).
    if (b.id === "meal_prep_master") {
      if (maxConsecutiveDayRun(ctx.mealDates ?? []) >= MEAL_PREP_RUN_DAYS) {
        ids.push(b.id);
      }
    }
  }
  return ids;
}

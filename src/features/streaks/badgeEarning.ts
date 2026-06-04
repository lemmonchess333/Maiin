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
  /** "Now" — threaded in so the rolling-window rule is pure/testable. */
  today: Date;
}

/** ≥5 lift-days AND ≥5 run-days within the inclusive 14-day window ending today. */
export function isBalancedEarned(
  workouts: BalancedWorkout[],
  runs: BalancedRun[],
  today: Date
): boolean {
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 13); // 14 days inclusive
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

  return liftDays.size >= 5 && runDays.size >= 5;
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

    // Rolling-window balanced badge.
    if (b.id === "balanced") {
      if (isBalancedEarned(ctx.workouts, ctx.runs, ctx.today)) ids.push(b.id);
    }
  }
  return ids;
}

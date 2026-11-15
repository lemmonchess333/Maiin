/**
 * The client's copy of the badge rules, for PROGRESS only.
 *
 * Every badge is awarded by the server (App1 Q33): the rules that decide an
 * award are `functions/lib/badgeRules.js`, run by the triggers that see each
 * session (`functions/lib/badgeAwards.js`). The app still draws a ring and
 * "X / Y" for a badge in progress (`badgeProgress.ts`), from the facts this
 * device can see, so it keeps the windows, the runs of days and the
 * thresholds here — and `badgeRules.cross.test.ts` pins each of them to the
 * server's running copy (ADR-0008), so a ring fills when the server would
 * award and not before.
 */

import { format } from "date-fns";

/** Minimal structural shapes — kept local so this module doesn't depend on the
 *  hook (which imports it). useStreaks' WorkoutRow / RunRow are assignable. */
export interface BalancedWorkout {
  date: string;
}
export interface BalancedRun {
  /** The local "YYYY-MM-DD" the run belongs to (Lift3: the day it started;
   *  `SavedRun.day`). Never the day it finished. */
  day: string;
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
  /**
   * Distinct YYYY-MM-DD dates with at least one log before 07:00 local time
   * (run completedAt / workout + meal createdAt). Precomputed in the hook so
   * the local-tz hour extraction stays in one place. Drives `early_bird`.
   */
  earlyLogDays?: string[];
  /**
   * Count of already-earned badges, EXCLUDING `ultimate_athlete` itself (so the
   * meta-badge can't count toward its own threshold), from `earnedBadgeCount`.
   * Drives `ultimate_athlete` progress.
   */
  earnedBadgeCount?: number;
  /**
   * Per-day nutrition facts (computeNutritionBadgeDays) joining intake totals
   * against the persisted per-day target snapshot. All three are date lists;
   * absent ⇒ no judgeable days. Drive the target-dependent nutrition badges:
   *  - macroMasterDays — all macros within ±5% (macro_master + triple_threat leg)
   *  - proteinHitDays  — protein ≥ target (protein_pro, 7-in-a-row)
   *  - waterHitDays    — glasses ≥ target (hydration_hero, 7-in-a-row)
   */
  macroMasterDays?: string[];
  proteinHitDays?: string[];
  waterHitDays?: string[];
  /** "Now" — threaded in so the rolling-window rule is pure/testable. */
  today: Date;
}

/** "Hit protein/water target 7 days in a row." */
export const NUTRITION_STREAK_DAYS = 7;

/** "Log before 07:00 for 5 days" — cumulative (no "in a row"), so distinct days. */
export const EARLY_BIRD_DAYS = 5;
/** "Earn 15 badges" — the completionist capstone. */
export const ULTIMATE_ATHLETE_COUNT = 15;

/**
 * How many badges count toward `ultimate_athlete`: earned badges minus the
 * meta-badge itself (otherwise it could self-satisfy at 14 + itself), as the
 * server's `ultimateAthleteDue` counts them.
 */
export function earnedBadgeCount(
  badges: { id: string; earnedAt: string | null }[]
): number {
  return badges.filter((b) => b.earnedAt && b.id !== "ultimate_athlete").length;
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
 *  today: the balanced (14d) and hybrid-frequency (7d) rings. */
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
    if (typeof r.day === "string" && inWindow(r.day)) runDays.add(r.day);
  }

  return { liftDays: liftDays.size, runDays: runDays.size };
}

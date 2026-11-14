import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import {
  pendingBadgeIds,
  subscribePendingBadges,
  queueServerAwards,
  dismissBadgeReveal,
} from "./pendingBadgeReveals";
import {
  useState,
  useSyncExternalStore,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  memo,
  use,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, useUid } from "@/lib/auth";
import { startDayKey } from "@/lib/startDay";
import type { ProgramState } from "@/features/program/programTypes";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import type { RunWindow } from "@/lib/savedRuns";
import { SAVED_WORKOUTS, type WorkoutWindow } from "@/lib/savedWorkouts";
import { useSavedRuns } from "@/hooks/useSavedRuns";
import { useSavedSessions } from "@/hooks/useSavedSessions";
import { BADGE_DEFINITIONS, initBadges, type EarnedBadge } from "./badges";
import { earnedBadgeCount } from "./badgeEarning";
import { useNutritionBadgeData } from "@/hooks/useNutritionBadgeData";
import {
  computeNutritionBadgeDays,
  type DayMacros,
} from "@/lib/nutritionBadgeDays";
import { activeMealDocs, sumMealTotals } from "@/lib/mealTotals";
import { isFoodDay } from "@/lib/foodDay";
import { format } from "date-fns";
import { logger } from "@/lib/logger";
import { cancelNotification } from "@/lib/notifications";
import { STREAK_NOTIFICATION_ID } from "@/hooks/streakNotificationId";
import { earlyDaysOf, keptEarlyDays, storedEarlyDays } from "./earlyLogDays";
import {
  isPlannedRestDay,
  keptThroughAfter,
  planHoldsSessions,
  plannedRestDays,
  type StreakPlan,
} from "./restDays";

export interface StreakData {
  /** The streak as shown: the today/yesterday rule, 0 when neither is active. */
  currentStreak: number;
  longestStreak: number;
  /** The last day with activity that the streak counted up to. */
  lastActiveDate: string;
  /**
   * The walk's certificate: `anchorStreak` days of streak ended on
   * `anchorDate`. True of that date for good, so a stale one is harmless,
   * and kept while the streak is alive even when `currentStreak` reads 0 the
   * morning after a rest day. Absent on documents written before
   * 2026-10-20, which anchor on {currentStreak, lastActiveDate}.
   */
  anchorStreak?: number;
  anchorDate?: string;
  /**
   * The last day the streak is kept through without another log: the day
   * its span ends on, then the plan's rest days straight after it (App1
   * Q32, `keptThroughAfter`). A forecast from the plan as it stood when it
   * was saved, for the readers that cannot read a plan: the server's evening
   * nudge, and, as the public profile's `lastActiveDate`, other people.
   * Absent on documents written before 13 November 2026.
   */
  keptThrough?: string;
  /**
   * WINDOWED, not lifetime (D13). Recomputed each load as the size of the
   * active-date set built from the subscriptions' window
   * (STREAK_WINDOW_DAYS), so it stays near 90 at most — a 2-year daily
   * user does NOT see 730 here. `currentStreak` survives the window via
   * the persisted anchor (`computeStreakSpanAnchored` — the stored
   * {count, lastActiveDate} pair certifies days that aged out);
   * `longestStreak` is persisted monotonically, and early_bird's days are
   * kept in `earlyLogDays`. This count alone is genuinely capped.
   *
   * HONESTY CONTRACT: any UI that renders this MUST label it as recent/windowed
   * ("active days", "active days · last 400") — NEVER "total" or "lifetime"
   * active days. To present a true-lifetime number, move to a server-maintained
   * aggregate FIRST; don't relabel the windowed value. Pinned in
   * `streakWindowing.test.ts`.
   */
  totalActiveDays: number;
  /**
   * Up to five distinct days with a log before 07:00, kept by the server's
   * award (functions/lib/badgeAwards.js) so early_bird's count outlives the
   * window. Read here for its progress ring only.
   */
  earlyLogDays?: string[];
  /** Every badge, earned or not. Earned ones are the server's (App1 Q33):
   *  this hook reads them and writes none. */
  badges: EarnedBadge[];
}

const DEFAULT_STREAKS: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: "",
  totalActiveDays: 0,
  badges: initBadges(),
};

// ── Subscription windows ─────────────────────────────────────────────────
// The streak reads STREAK_WINDOW_DAYS back: as far as Food lets a meal be
// added (its FOOD_TAP_BACK_DAYS), so a meal logged today for any day the
// diary reaches still counts. Meals are bounded by when they were logged,
// so a backfilled meal is read whatever its date. A long streak outlives
// the window through the persisted anchor (computeStreakSpanAnchored): the
// window only has to reach the last save plus grace, and every active day
// saves. Badges are the server's (App1 Q33): earned ones stay earned, and
// early_bird's days are kept on the streak document by its award.
// The caps are a backstop for a heavy logger, not the bound.
// totalActiveDays remains windowed, not truly lifetime (D13 — the
// saturation is a DELIBERATE accepted limit, documented on the
// StreakData.totalActiveDays field; any consumer that displays it must
// label it as windowed, never "total/lifetime"). The honest alternative — a
// server-maintained lifetime aggregate — is deferred until a surface
// actually needs a true-lifetime number.
export const STREAK_WINDOW_DAYS = 90;
const WORKOUT_CAP = 400;
const RUN_CAP = 400;
const MEAL_CAP = 500;
/** The first day the streak reads. */
function streakWindowStart(todayKey: string): string {
  return localDateString(
    addLocalDays(parseLocalDate(todayKey), -STREAK_WINDOW_DAYS)
  );
}

// ── Timezone notes ───────────────────────────────────────────────────────
// All date math uses date-fns format() which respects the device timezone.
// DST: wall-clock dates don't change on DST boundaries, so date-fns handles
// it automatically. Timezone travel: crossing timezones can shift date
// boundaries by 1 day. Out of scope for v1 — the alternative (storing a
// per-user canonical timezone) adds complexity without clear value.

// ── Row shapes (minimal — only what the streak hook needs) ──────────────
interface WorkoutRow {
  date: string;
  /** Save time — carried for early_bird's before-7am check. */
  createdAt?: Timestamp | null;
}

interface RunRow {
  /** The local day the run belongs to (Lift3: the day it started,
   *  `SavedRun.day`). The streak, badges and Food count a run on it. */
  day: string;
  /** When the run finished. Read only by early_bird's before-7am check,
   *  which is about when a log happened, as the workouts' and meals'
   *  `createdAt` are. */
  completedAt: Date;
  /* Persisted onto every run doc by the validity correction
     (PR #480). Carried here so the snapshot mapping can drop invalid
     and zero-distance records before they credit a streak day. */
  isInvalid?: boolean;
  distance?: number;
}

interface MealRow {
  date: string;
  items: unknown[];
  /** Log time — carried for early_bird's before-7am check. */
  createdAt?: Timestamp | null;
  /** Per-meal macro totals — summed per day for the nutrition badges. */
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
}

// ── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Hydrate a stored `streaks/data.badges` array against the catalogue: every
 * definition, in catalogue order, with the stored `earnedAt` (or null).
 * Stored entries may be full EarnedBadge objects (what the app wrote when
 * it awarded badges itself, before App1 Q33) or the `{ id, earnedAt,
 * earnedBy }` entries the server's award writes — this is what makes the
 * shapes interchangeable, and it backfills new definitions as unearned for
 * existing users with no migration.
 */
function mergeWithCatalogue(
  stored: readonly { id: string; earnedAt?: string | null }[] | undefined
): EarnedBadge[] {
  const saved = Array.isArray(stored) ? stored : [];
  return BADGE_DEFINITIONS.map((def) => {
    const hit = saved.find((b) => b && b.id === def.id);
    return { ...def, earnedAt: hit?.earnedAt || null };
  });
}

/**
 * Build the set of active dates (YYYY-MM-DD) from workouts, runs, and meals.
 * A date counts as active if ANY of the three sources contributes it.
 * Meals must have at least one item to count (guards against draft/empty docs).
 *
 * Exported for the parity cross-test only: the server re-derives this set
 * (functions/lib/activeDates.js) for the streak-nudge cron, and
 * activeDatesParity.cross.test.ts pins the two equal on shared fixtures.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeActiveDateSet(
  workouts: WorkoutRow[],
  runs: RunRow[],
  meals: MealRow[]
): Set<string> {
  const set = new Set<string>();

  for (const w of workouts) {
    if (typeof w.date === "string" && w.date) set.add(w.date);
  }

  for (const r of runs) {
    if (typeof r.day === "string" && r.day) set.add(r.day);
  }

  for (const m of meals) {
    if (typeof m.date !== "string" || !m.date) continue;
    if (!Array.isArray(m.items) || m.items.length === 0) continue;
    set.add(m.date);
  }

  return set;
}

// ── Grace forgiveness (Streak1 — see .claude/plans/programme-run-followups.md)
//
// A single off-day inside an otherwise-consistent run does NOT break the
// streak. This is the calm forgiveness model the field has converged on
// (Apple watchOS-11 ring pause, MyFitnessPal backfill, habit-tracker
// "never miss twice") — deliberately NOT a Duolingo-style earned-token
// economy.
//
// Rule: walking back from the end anchor, a non-active day may be BRIDGED
// (counted toward the streak span) only if no grace was spent within the
// prior GRACE_MIN_SPACING_DAYS of the walk. That single spacing constraint
// enforces BOTH invariants at once:
//   • "never miss twice" — two consecutive misses are 1 day apart < spacing,
//     so the second is denied and the walk stops; and
//   • "≤1 forgiven day per rolling 7" — a second grace is only allowed once
//     7 calendar days separate it from the last one.
// Spacing is counted in calendar-day steps (not milliseconds) so DST
// transitions can't shift the boundary.
//
// A bridged day is held as PENDING until an older active day confirms it —
// so grace can't extend the streak into pre-history (a trailing/leading gap
// with no active day behind it is discarded, not counted).
const GRACE_MIN_SPACING_DAYS = 7;

/**
 * The YYYY-MM-DD key for the calendar day before `now`, computed by a calendar
 * step (NOT `now - 86400000`). Millisecond subtraction is DST-unsafe: on a
 * fall-back day (25h) it can land back on today's own date, and on a
 * spring-forward day (23h) it can skip a calendar day — either of which
 * silently corrupts the streak anchor. `setDate(-1)` is wall-clock and matches
 * the DST-proof step the backward walk already uses.
 */
function yesterdayKey(now: Date): string {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return format(y, "yyyy-MM-dd");
}

export interface StreakSpan {
  /** Streak length including any bridged grace days and covered rest days. */
  streak: number;
  /**
   * The non-active dates (YYYY-MM-DD) that grace bridged inside the current
   * span, newest-first. Empty when the streak is unbroken or zero. Used by
   * the UI to surface gentle after-the-fact reassurance ("yesterday's rest
   * day is covered") — never a pre-emptive warning.
   */
  bridgedDates: string[];
  /**
   * The plan's rest days the span counts (App1 Q32, `restDays.ts`),
   * newest-first. Each is a day of the streak without a log, as a forgiven
   * day is, but the plan's own, so it spends no grace.
   */
  restDates: string[];
  /**
   * The day the streak ends on: today when today is logged or a rest day,
   * else yesterday. Null when the streak is 0.
   */
  endDate: string | null;
  /**
   * The newest logged day in the span: `endDate`, or before it when the
   * days after it are rest days. Null when the streak is 0. The stored
   * certificate ends here, so the day it names is always a logged one.
   */
  lastActiveDate: string | null;
}

/** No rest days: a person with no plan, and every walk before App1 Q32. */
const NO_REST_DAYS: ReadonlySet<string> = new Set();

const ZERO_SPAN: StreakSpan = {
  streak: 0,
  bridgedDates: [],
  restDates: [],
  endDate: null,
  lastActiveDate: null,
};

/**
 * The persisted streak state, used to extend the walk past the read window.
 *
 * `streak` days ending at `lastActiveDate` were CERTIFIED by an earlier
 * computation over data that has since aged out of the subscriptions. The
 * walk stops there and credits the count instead of needing the documents.
 */
export interface StreakAnchor {
  streak: number;
  lastActiveDate: string;
}

/**
 * Walk the streak once and return its length, the grace days it bridged,
 * the rest days it covered and the day it ends on.
 *
 * Today/yesterday rule — the streak does NOT drop to zero at midnight.
 * - If today is active or a rest day: streak ends on today (live).
 * - Else if yesterday is: streak ends on yesterday (at risk).
 * - Else: streak = 0 (broken).
 * Walks backwards from the ending date, incrementing while days are in the
 * set, covering the plan's rest days (`restDays`, App1 Q32) and bridging
 * isolated non-active days per the grace rule above. A rest day spends no
 * grace and is still a calendar day, so the grace's spacing counts it; a
 * second forgiven day also needs a logged day since the first. Like
 * a bridged day, a rest day waits for an older active day to confirm it: a
 * streak never starts on rest.
 *
 * `now` is injectable for deterministic tests; production callers omit it.
 *
 * `anchor` (optional) is what makes long streaks computable from a bounded
 * window — see `computeStreakSpanAnchored`, which is the entry point that
 * also guards against a stale-LOW anchor. When the walk reaches the
 * anchor's `lastActiveDate` unbroken, it credits the anchored count and
 * stops; a chain that breaks before reaching it ignores the anchor.
 *
 * The anchor certifies its own forgiven days against each other, not against
 * one this walk has just spent. So when the walk reaches the anchor within
 * GRACE_MIN_SPACING_DAYS of its own grace, it walks on through the anchored
 * span's newest days (they are in the window: the pair is saved on every
 * visit) until the spacing no longer binds, and credits the rest of the
 * count only then. Crediting at once let every-other-day logging, with the
 * pair written back each day, add two days a day: day 20 read 21 where the
 * rule allows 3. Rest days inside the anchored span are walked as days of
 * it, so they count toward what has been walked.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeStreakSpan(
  activeDates: Set<string>,
  now: Date = new Date(),
  anchor?: StreakAnchor,
  restDays: ReadonlySet<string> = NO_REST_DAYS
): StreakSpan {
  if (activeDates.size === 0) return ZERO_SPAN;

  const today = format(now, "yyyy-MM-dd");
  const yesterday = yesterdayKey(now);
  const kept = (key: string) => activeDates.has(key) || restDays.has(key);

  let endKey: string;
  if (kept(today)) {
    endKey = today;
  } else if (kept(yesterday)) {
    endKey = yesterday;
  } else {
    return ZERO_SPAN;
  }
  const endDate = new Date(endKey + "T12:00:00");

  let streak = 0;
  // Grace and rest days tentatively counted, awaiting a confirming older
  // active day.
  let pending = 0;
  // Calendar days walked since the last grace was spent (Infinity = none yet).
  let stepsSinceGrace = Infinity;
  // Whether a logged day has been walked since the last grace. Without rest
  // days the spacing alone ensures it; with them, a plan of one session a
  // week could miss it every week, each a week apart, and grow a streak
  // with no log at all. "Never miss twice" means two missed sessions.
  let loggedSinceGrace = true;
  // Confirmed + pending bridged and rest dates (newest-first by walk order).
  const bridged: string[] = [];
  let pendingBridged: string[] = [];
  const rested: string[] = [];
  let pendingRested: string[] = [];
  let lastActive: string | null = null;

  const confirmPending = () => {
    streak += pending;
    pending = 0;
    bridged.push(...pendingBridged);
    pendingBridged = [];
    rested.push(...pendingRested);
    pendingRested = [];
  };
  const span = (count: number): StreakSpan =>
    count > 0
      ? {
          streak: count,
          bridgedDates: bridged,
          restDates: rested,
          endDate: endKey,
          lastActiveDate: lastActive,
        }
      : ZERO_SPAN;

  // Days of the anchored span walked one by one, while its credit waits for
  // this walk's last grace to fall a full spacing behind (see above). Null
  // when the walk is not inside the anchored span.
  let anchoredDaysWalked: number | null = null;
  let anchorLeft = anchor;
  /** Inside the anchored span, once the next step back is a week from this
   *  walk's grace: the rest of the anchored count, credited. Null to walk on. */
  const creditAnchoredRest = (): StreakSpan | null => {
    if (!anchorLeft || anchoredDaysWalked === null) return null;
    anchoredDaysWalked++;
    if (stepsSinceGrace + 1 < GRACE_MIN_SPACING_DAYS) return null;
    const remaining = anchorLeft.streak - anchoredDaysWalked;
    if (remaining > 0) {
      // The anchored span certifies the rest days walked inside it.
      confirmPending();
      return span(streak + remaining);
    }
    // A stale-low anchor this walk has already outrun: walk on plain.
    anchorLeft = undefined;
    anchoredDaysWalked = null;
    return null;
  };

  const cursor = new Date(endDate);
  while (true) {
    const cursorKey = format(cursor, "yyyy-MM-dd");
    if (activeDates.has(cursorKey)) {
      lastActive ??= cursorKey;
      if (anchorLeft && cursorKey === anchorLeft.lastActiveDate) {
        // Anchor day reached with the chain unbroken and no grace near it:
        // everything older is already certified — credit the anchored count
        // (which includes this day) and stop. This is what lets a 300-day
        // streak survive a meal window that only covers ~167 days of
        // documents.
        if (stepsSinceGrace >= GRACE_MIN_SPACING_DAYS) {
          confirmPending();
          return span(streak + anchorLeft.streak);
        }
        anchoredDaysWalked = 0;
      }
      // An active day confirms any pending grace or rest day before it.
      confirmPending();
      streak += 1;
      loggedSinceGrace = true;
      // From the next step back a missed day is a week from this walk's
      // grace, so the anchored span's own forgiving holds: credit the rest.
      const credited = creditAnchoredRest();
      if (credited) return credited;
    } else if (restDays.has(cursorKey)) {
      // The plan's rest day: counted once an older active day confirms it.
      pending++;
      pendingRested.push(cursorKey);
      const credited = creditAnchoredRest();
      if (credited) return credited;
    } else {
      // Non-active day — bridge it only if far enough from the last grace,
      // with a logged day between.
      if (stepsSinceGrace < GRACE_MIN_SPACING_DAYS || !loggedSinceGrace) break;
      pending++;
      pendingBridged.push(cursorKey);
      stepsSinceGrace = 0;
      loggedSinceGrace = false;
    }
    cursor.setDate(cursor.getDate() - 1);
    stepsSinceGrace++;
  }
  // Any unconfirmed pending grace or rest (a trailing gap into pre-history)
  // is dropped.
  return span(streak);
}

/**
 * The anchor as the active set can attest it. The anchor's span counts
 * every calendar day through its last one, so when that day is no longer
 * active (its only log deleted) the same span still certifies the streak
 * through the latest active day inside it, that many days shorter: 200
 * ending today is 199 ending yesterday. Without this the walk fell back to
 * what the window can see, and the save then stored that over the
 * certificate. Null when no active day inside the span is left.
 */
function attestedAnchor(
  activeDates: Set<string>,
  anchor: StreakAnchor
): StreakAnchor | null {
  if (activeDates.has(anchor.lastActiveDate)) return anchor;
  const end = parseLocalDate(anchor.lastActiveDate);
  for (let back = 1; back < anchor.streak; back++) {
    const day = localDateString(addLocalDays(end, -back));
    if (activeDates.has(day))
      return { streak: anchor.streak - back, lastActiveDate: day };
  }
  return null;
}

/**
 * The anchored entry point: the better of the anchored and pure walks.
 *
 * WHY THIS EXISTS (probe sweep 2026-08-05, verifier-confirmed): the live
 * recompute is windowed, and meals are the one source with several DOCUMENTS
 * per day — so the 500-doc meal window covers only ~500/mealsPerDay DAYS
 * (~167 at three meals a day). The recompute then OVERWROTE the persisted
 * `currentStreak` with the truncated value on every visit: a meal-driven
 * streak froze at ~167 while the user kept logging daily, and the 365-day
 * badge was unreachable for any ≥2-meals/day logger. `longestStreak` already
 * ratchets against the stored value; `currentStreak` needed the same
 * courtesy, done properly — the stored pair {count, lastActiveDate} is a
 * certificate for the days that have aged out of the window.
 *
 * Taking the MAX of the two walks is what makes a stale-LOW anchor harmless:
 * both results are true lower bounds of the real streak (the pure walk
 * proves what the window can see; the anchored walk extends past it), so
 * the larger one is always the better bound. A broken chain ignores the
 * anchor by construction — the walk returns before reaching it — so the
 * anchor can never resurrect a genuinely dead streak. Garbage anchors
 * (non-finite count, malformed date, a date the active set doesn't attest)
 * fall back to the pure walk.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeStreakSpanAnchored(
  activeDates: Set<string>,
  anchor: StreakAnchor | null | undefined,
  now: Date = new Date(),
  restDays: ReadonlySet<string> = NO_REST_DAYS
): StreakSpan {
  const pure = computeStreakSpan(activeDates, now, undefined, restDays);
  if (!anchor) return pure;
  if (!Number.isFinite(anchor.streak) || anchor.streak <= 0) return pure;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor.lastActiveDate)) return pure;
  const attested = attestedAnchor(activeDates, anchor);
  // Early-out, not a guard: the walk credits the anchor only on a day the
  // active set already attests (the branch lives inside the has() check),
  // so an unattested anchor can never alter the result — skipping the
  // second walk here just saves the work of proving that.
  if (!attested) return pure;
  const anchored = computeStreakSpan(activeDates, now, attested, restDays);
  if (anchored.streak < pure.streak) return pure;
  // The anchored walk stops at the stored pair, which once saved is today
  // or yesterday, so on its own it names no covered day. The plain walk
  // takes the same steps over the days it can see, so its days are the
  // streak's: the sheet's covered days and its line of reassurance stay
  // after the save.
  return {
    ...anchored,
    bridgedDates: newestFirst(anchored.bridgedDates, pure.bridgedDates),
    restDates: newestFirst(anchored.restDates, pure.restDates),
  };
}

/** Two lists of day keys as one, without repeats, newest first. */
function newestFirst(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].sort().reverse();
}

export interface StreakState {
  /** The streak shown now: the today/yesterday rule, 0 when neither day is
   *  logged or a rest day. */
  live: StreakSpan;
  /**
   * The streak logging today keeps. `live` while it is alive; on the morning
   * after a day off, when `live` is 0, the streak through the day before
   * yesterday, which logging today saves with yesterday as its forgiven day.
   * 0 when nothing is left to save. The evening reminders read this: they
   * exist for exactly that morning-after.
   */
  savable: number;
  /**
   * The pair to persist: the streak through its last logged day, with that
   * day. Null leaves the stored pair as it is (a streak already broken).
   * Rest days after the last logged day are not in it: they are walked again
   * from the plan, so the pair always ends on a day with a log.
   */
  anchor: StreakAnchor | null;
  /**
   * The day the counted span ends on (`live`'s, or the held span's on the
   * morning after a day off), rest days included. Null with `anchor`.
   */
  endDate: string | null;
}

/** The pair a span stores: its count through its last logged day. Every
 *  day after that one is a rest day or a forgiven one the span counts. */
function anchorOf(span: StreakSpan): StreakAnchor | null {
  if (span.streak <= 0 || !span.lastActiveDate) return null;
  const last = span.lastActiveDate;
  const after = [...span.restDates, ...span.bridgedDates].filter(
    (d) => d > last
  ).length;
  return { streak: span.streak - after, lastActiveDate: last };
}

/**
 * The live streak, the streak still savable today, and the pair to store.
 *
 * The stored pair is the anchor of the next walk, so it must name the span
 * it counts and must not be thrown away while the streak lives. It held the
 * live count with "today, if active, else the last stored day", which went
 * wrong two ways: on the morning after a rest day the live count is 0, and
 * saving it replaced a 100-day certificate with 0, so the evening's log
 * read only what the window could see; and a backfilled yesterday saved 101
 * against the day before, so the next day read 103 for 102.
 *
 * `restDays` are the plan's rest days over the days read (App1 Q32,
 * `restDays.ts`); none for a person with no plan.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeStreakState(
  activeDates: Set<string>,
  stored: StreakAnchor | null | undefined,
  now: Date = new Date(),
  restDays: ReadonlySet<string> = NO_REST_DAYS
): StreakState {
  const live = computeStreakSpanAnchored(activeDates, stored, now, restDays);
  const liveAnchor = anchorOf(live);
  if (liveAnchor) {
    return {
      live,
      savable: live.streak,
      anchor: liveAnchor,
      endDate: live.endDate,
    };
  }
  // Today and yesterday are both empty: the walk as of yesterday is the
  // streak through the day before it, which today's log would still keep.
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const held = computeStreakSpanAnchored(
    activeDates,
    stored,
    yesterday,
    restDays
  );
  const heldAnchor = anchorOf(held);
  return heldAnchor
    ? {
        live,
        savable: held.streak,
        anchor: heldAnchor,
        endDate: held.endDate,
      }
    : { live, savable: 0, anchor: null, endDate: null };
}

/**
 * What a session saved on `day` does to the streak: the streak as it
 * stands (`savable`, so the morning after a rest day it is the streak
 * logging today keeps, not 0) and as it stands with `day` active. Equal
 * when the day is already active, or too far back to reach the streak.
 * A post names the milestone the session reached from it (Soc15,
 * `streakMoment`), through the same walk, grace, rest days and anchor as
 * the streak shown everywhere else.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function streakAcross(
  activeDates: ReadonlySet<string>,
  stored: StreakAnchor | null | undefined,
  day: string,
  now: Date = new Date(),
  restDays: ReadonlySet<string> = NO_REST_DAYS
): { before: number; after: number } {
  const before = computeStreakState(
    new Set(activeDates),
    stored,
    now,
    restDays
  ).savable;
  if (activeDates.has(day)) return { before, after: before };
  const withDay = new Set(activeDates);
  withDay.add(day);
  return {
    before,
    after: computeStreakState(withDay, stored, now, restDays).savable,
  };
}

/** The certificate a stored document carries: its anchor fields, or the
 *  {currentStreak, lastActiveDate} pair a document from before them has. */
function storedAnchorOf(
  data: Pick<
    StreakData,
    "currentStreak" | "lastActiveDate" | "anchorStreak" | "anchorDate"
  >
): StreakAnchor {
  return data.anchorStreak !== undefined && data.anchorDate !== undefined
    ? { streak: data.anchorStreak, lastActiveDate: data.anchorDate }
    : { streak: data.currentStreak, lastActiveDate: data.lastActiveDate };
}

// ── Internal hook (single instance — lives inside <StreaksProvider>) ────
//
// The hook itself is unchanged; only the export surface changed. Previously
// every caller (Home, BadgeGrid, useStreakReminder, ...) instantiated this
// directly, each spinning up 4 Firestore subscriptions. Now <StreaksProvider>
// runs it once near the authenticated root, and consumers read from context.

function useStreaksInternal(planProfile: PlanProfile | null) {
  const todayKey = useLocalDateKey();
  const uid = useUid();

  // Streaks doc state (persisted badges + longest streak)
  const [streakData, setStreakData] = useState<StreakData>(DEFAULT_STREAKS);

  // Source streams
  const [meals, setMeals] = useState<MealRow[]>([]);
  // The programme, for its run days and race: with the profile's schedule
  // they say which days are the plan's rest days (App1 Q32).
  const [program, setProgram] = useState<ProgramState | null>(null);

  /* Runs come through the one saved-run reader: one parse, the Lift3 day,
     and runs saved on this phone but not yet synced, so an offline run
     keeps the streak the moment it is saved. Invalid and zero-distance
     records are dropped here, so neither computeActiveDateSet nor
     computeStreakDays needs to know the predicate: a saved-anyway 0:02
     record shouldn't credit a streak day. The reader scopes rows to the
     signed-in account and settles out of loading on a failed read. */
  /* Workouts the same way, through the one workout reader: the day each
     belongs to and workouts finished on this phone but not yet synced. */
  const windowStart = streakWindowStart(todayKey);
  const workoutWindow = useMemo<WorkoutWindow>(
    () => ({ since: windowStart, cap: WORKOUT_CAP }),
    [windowStart]
  );
  const runWindow = useMemo<RunWindow>(
    () => ({ since: windowStart, cap: RUN_CAP }),
    [windowStart]
  );
  const savedWorkouts = useSavedSessions(
    SAVED_WORKOUTS,
    uid,
    uid ? workoutWindow : null
  );
  const workoutsLoaded = !!uid && savedWorkouts.answered;
  const workouts = useMemo<WorkoutRow[]>(
    () =>
      savedWorkouts.items.map((workout) => ({
        date: workout.date,
        createdAt:
          workout.createdAt instanceof Timestamp ? workout.createdAt : null,
      })),
    [savedWorkouts.items]
  );
  const savedRuns = useSavedRuns(uid ? runWindow : null);
  // The run list itself, not a run waiting to sync: the streak is saved
  // once everything has loaded, and a streak counted from that one run
  // would overwrite the saved one.
  const runsLoaded = !!uid && savedRuns.answered;
  const runs = useMemo<RunRow[]>(
    () =>
      savedRuns.runs.filter(isVolumeEligible).map((run) => ({
        day: run.day,
        completedAt: run.completedAt,
        isInvalid: run.isInvalid,
        distance: run.distance,
      })),
    [savedRuns.runs]
  );

  // Loading gates — 5 independent flags. We wait for all 5 to flip before
  // computing or persisting anything.
  const [streaksDocLoaded, setStreaksDocLoaded] = useState(false);
  const [mealsLoaded, setMealsLoaded] = useState(false);
  const [programLoaded, setProgramLoaded] = useState(false);
  // A failed read settles its loaded flag (below) so nothing hangs, but
  // what it left behind is the defaults, not the data: the streak counted
  // from it must not be saved over the stored one.
  const [streaksDocFailed, setStreaksDocFailed] = useState(false);
  const [mealsFailed, setMealsFailed] = useState(false);
  // Without the programme the plan's rest days are partly unknown, and a
  // streak walked without them is shorter than the person's.
  const [programFailed, setProgramFailed] = useState(false);
  // Bumped by retryLoad: Firestore ends a listener that fails, so trying
  // again means opening the two below afresh.
  const [streamsAttempt, setStreamsAttempt] = useState(0);

  // Account-switch reset (React "adjust state during render" idiom). Every
  // stream above belongs to the account it was read for, so any uid change
  // — sign-out, or A → B with no signed-out render between — drops all of
  // it in the same render that sees the new uid. From an effect the reset
  // would land a commit late: that commit would render the previous
  // account's streak, and with its loaded flags still true the persist
  // effect would run against A's rows under B's uid. Cleared
  // here, the flags hold it off until the new account's four
  // streams have landed. The refs are reset in the subscription effect's
  // signed-out branch: a ref can't be written while rendering.
  const [streamsUid, setStreamsUid] = useState(uid);
  if (streamsUid !== uid) {
    setStreamsUid(uid);
    setStreakData(DEFAULT_STREAKS);
    setMeals([]);
    setProgram(null);
    setStreaksDocLoaded(false);
    setMealsLoaded(false);
    setProgramLoaded(false);
    setStreaksDocFailed(false);
    setMealsFailed(false);
    setProgramFailed(false);
  }

  // The reveal queue: the server's awards this device has not revealed
  // (pendingBadgeReveals.ts), one at a time, each once it is in the record.
  const pendingIds = useSyncExternalStore(
    subscribePendingBadges,
    () => pendingBadgeIds(uid),
    () => pendingBadgeIds(null)
  );
  const newBadge =
    pendingIds
      .map((id) => streakData.badges.find((b) => b.id === id && b.earnedAt))
      .find(Boolean) ?? null;

  // Refs — track state across renders without triggering re-runs
  // What the last streak save wrote (its fields, as JSON), so a recompute
  // that changes nothing writes nothing.
  const lastWrittenStreakRef = useRef<string | null>(null);

  // ── Subscribe to all 4 streams ─────────────────────────────────────────

  useEffect(() => {
    if (!uid) {
      // Signed out: nothing to subscribe to. The streams were already
      // dropped during render (the account-switch reset above); the refs
      // are this effect's to clear, so the next account starts from a
      // clean baseline.
      lastWrittenStreakRef.current = null;
      return;
    }

    // Error callback applied to every subscription below: if any one fails,
    // flip its *Loaded flag true so `allLoaded` still resolves and the UI
    // doesn't hang in a skeleton state. State for the failed source stays
    // at its previous value (empty by default, stale if we already had data),
    // and its *Failed flag holds the streak save off (`readFailed`).
    const onSubscriptionError =
      (
        source: string,
        setLoadedFlag: (v: boolean) => void,
        setFailedFlag: (v: boolean) => void
      ) =>
      (err: unknown) => {
        logger.error(`[useStreaks] ${source} subscription failed`, err);
        setFailedFlag(true);
        setLoadedFlag(true);
      };

    const streaksRef = doc(db, "users", uid, "streaks", "data");
    const unsubStreaks = onSnapshot(
      streaksRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as StreakData;
          // Merge badge definitions with saved earned dates — this auto-backfills
          // new badges as earnedAt: null for existing users. No migration needed.
          const merged = mergeWithCatalogue(data.badges);
          // Spread DEFAULT_STREAKS first so legacy docs that pre-date a field
          // (e.g. longestStreak / totalActiveDays) don't propagate `undefined`
          // into state — that previously caused `Math.max(n, undefined) === NaN`
          // downstream at line 329 and surfaced as "NaN" on the Longest streak
          // stat card in BadgeGrid. The persist effect will naturally rewrite
          // the doc with the full field set on the next streak mutation.
          //
          // Sanitize the two numeric streak fields on read: an earlier buggy
          // persist (pre-spread-default) could have written `NaN` into
          // streaks/data.longestStreak. `NaN` is a present value, so the
          // spread-default above does NOT replace it. Coerce any non-finite
          // value to 0 here so Math.max(currentStreak, 0) can't produce NaN.
          const sanitizedCurrent = Number.isFinite(data.currentStreak)
            ? data.currentStreak
            : 0;
          const sanitizedLongestRaw = Number.isFinite(data.longestStreak)
            ? data.longestStreak
            : 0;
          const sanitizedTotal = Number.isFinite(data.totalActiveDays)
            ? data.totalActiveDays
            : 0;
          // Badge-earned reconciliation: if a streak-threshold badge has an
          // earnedAt timestamp, the user reached at least that threshold
          // at some point — so longestStreak must be >= threshold. We saw
          // rows where Week Warrior (threshold 7) was earned but
          // longestStreak was 4, which meant the old NaN-write bug wiped
          // the longestStreak without clearing earnedAt. Patch it up on
          // read so the UI and the persist effect agree. Bronze/plate/run
          // badges with no threshold are ignored.
          const impliedFromBadges = merged.reduce((max, b) => {
            if (!b.earnedAt) return max;
            if (typeof b.threshold !== "number" || b.threshold <= 0) return max;
            return b.threshold > max ? b.threshold : max;
          }, 0);
          const sanitizedLongest = Math.max(
            sanitizedLongestRaw,
            impliedFromBadges
          );
          const anchorStreak =
            Number.isFinite(data.anchorStreak) && (data.anchorStreak ?? 0) > 0
              ? data.anchorStreak
              : undefined;
          const anchorDate =
            typeof data.anchorDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(data.anchorDate)
              ? data.anchorDate
              : undefined;
          const keptThrough =
            typeof data.keptThrough === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(data.keptThrough)
              ? data.keptThrough
              : undefined;
          setStreakData({
            ...DEFAULT_STREAKS,
            ...data,
            currentStreak: sanitizedCurrent,
            longestStreak: sanitizedLongest,
            totalActiveDays: sanitizedTotal,
            anchorStreak,
            anchorDate,
            keptThrough,
            earlyLogDays: storedEarlyDays(data.earlyLogDays),
            badges: merged,
          });

          // The server's awards this device has not revealed yet, earned
          // while it watched or while it was away (pendingBadgeReveals).
          queueServerAwards(uid, data.badges);
        } else {
          setStreakData(DEFAULT_STREAKS);
        }
        setStreaksDocLoaded(true);
      },
      onSubscriptionError("streaks", setStreaksDocLoaded, setStreaksDocFailed)
    );

    const mealsRef = collection(db, "users", uid, "meals");
    const mealsQ = query(
      mealsRef,
      where("createdAt", ">=", Timestamp.fromDate(parseLocalDate(windowStart))),
      orderBy("createdAt", "desc"),
      limit(MEAL_CAP)
    );
    const unsubMeals = onSnapshot(
      mealsQ,
      (snap) => {
        /* HOME-MEALS-01 — filter before mapping. Deletion is soft, so a
           corrected meal still arrives here; counting it fed a phantom
           active DATE into computeActiveDateSet, so a day whose only meal
           was deleted still extended a nutrition streak and earned badges.
           `activeMealDocs` is generic precisely so this row shape (items,
           createdAt) survives the filter. */
        const rows: MealRow[] = activeMealDocs(
          snap.docs.map(
            (d) =>
              d.data() as {
                date?: unknown;
                items?: unknown;
                createdAt?: unknown;
                totalCalories?: unknown;
                totalProtein?: unknown;
                totalCarbs?: unknown;
                totalFat?: unknown;
                deletedAt?: unknown;
              }
          )
        ).map((raw) => {
          const numOrUndef = (v: unknown) =>
            typeof v === "number" && Number.isFinite(v) ? v : undefined;
          return {
            date: typeof raw.date === "string" ? raw.date : "",
            items: Array.isArray(raw.items) ? raw.items : [],
            createdAt:
              raw.createdAt instanceof Timestamp ? raw.createdAt : null,
            totalCalories: numOrUndef(raw.totalCalories),
            totalProtein: numOrUndef(raw.totalProtein),
            totalCarbs: numOrUndef(raw.totalCarbs),
            totalFat: numOrUndef(raw.totalFat),
          };
        });
        setMeals(rows);
        setMealsLoaded(true);
      },
      onSubscriptionError("meals", setMealsLoaded, setMealsFailed)
    );

    // The programme's run days and race, for the plan's rest days. Read
    // only: the programme's upkeep belongs to useProgram.
    const unsubProgram = onSnapshot(
      doc(db, "users", uid, "programState", "current"),
      (snap) => {
        setProgram(snap.exists() ? (snap.data() as ProgramState) : null);
        setProgramLoaded(true);
      },
      onSubscriptionError("programme", setProgramLoaded, setProgramFailed)
    );

    return () => {
      unsubStreaks();
      unsubMeals();
      unsubProgram();
    };
  }, [uid, streamsAttempt, windowStart]);

  const allLoaded =
    streaksDocLoaded &&
    workoutsLoaded &&
    runsLoaded &&
    mealsLoaded &&
    programLoaded;
  // Any stream that settled by failing. The saved-session readers report
  // `failed` only when they hold no rows for this account; rows already
  // read stay the evidence they were.
  const readFailed =
    streaksDocFailed ||
    mealsFailed ||
    programFailed ||
    savedWorkouts.failed ||
    savedRuns.failed;

  // The plan the streak's rest days are read from (App1 Q32), and those
  // days over the window the streak reads. A person with no plan has none.
  const plan = useMemo<StreakPlan>(
    () => ({
      profile: planProfile?.schedule ?? null,
      startKey: planProfile?.startKey ?? null,
      programState: program,
    }),
    [planProfile, program]
  );
  const restDays = useMemo(
    () => plannedRestDays(plan, windowStart, todayKey, todayKey),
    [plan, windowStart, todayKey]
  );

  // Per-day macro-target snapshots + water docs for the nutrition badges
  // (its own two listeners, owned here so they're singular per session).
  const { macroTargetsByDay, waterByDay } = useNutritionBadgeData();

  // ── Derived state ──────────────────────────────────────────────────────

  const {
    currentStreak: storedCurrent,
    lastActiveDate: storedLastActive,
    anchorStreak: storedAnchorStreak,
    anchorDate: storedAnchorDate,
    keptThrough: storedKeptThrough,
  } = streakData;
  const storedAnchor = useMemo(
    () =>
      storedAnchorOf({
        currentStreak: storedCurrent,
        lastActiveDate: storedLastActive,
        anchorStreak: storedAnchorStreak,
        anchorDate: storedAnchorDate,
      }),
    [storedCurrent, storedLastActive, storedAnchorStreak, storedAnchorDate]
  );

  const {
    activeDateSet,
    currentStreak,
    savableStreak,
    anchorToStore,
    keptThrough,
    totalActiveDays,
    bridgedDates,
    restDates,
  } = useMemo(() => {
    if (!allLoaded) {
      return {
        activeDateSet: new Set<string>(),
        currentStreak: 0,
        savableStreak: 0,
        anchorToStore: null as StreakAnchor | null,
        keptThrough: null as string | null,
        totalActiveDays: 0,
        bridgedDates: [] as string[],
        restDates: [] as string[],
      };
    }
    const set = computeActiveDateSet(workouts, runs, meals);
    // Anchored on the persisted {currentStreak, lastActiveDate} pair, so a
    // streak longer than the read window survives the recompute instead of
    // being truncated to what the window can see and then PERSISTED back
    // (the freeze the probe sweep measured at ~167 days for a 3-meals/day
    // logger). streakData is sanitized on read (finite-or-0), and the
    // anchored walk ignores anchors the active set can't attest. The
    // recompute is a fixed point of its own persist — re-running with the
    // just-written anchor returns the same number — so this cannot
    // oscillate with the subscription.
    const state = computeStreakState(
      set,
      storedAnchor,
      parseLocalDate(todayKey),
      restDays
    );
    return {
      activeDateSet: set,
      currentStreak: state.live.streak,
      savableStreak: state.savable,
      anchorToStore: state.anchor,
      keptThrough: state.endDate
        ? keptThroughAfter(state.endDate, plan, todayKey)
        : null,
      // Grace and rest days never inflate the honest "days you showed up"
      // count.
      totalActiveDays: set.size,
      bridgedDates: state.live.bridgedDates,
      restDates: state.live.restDates,
    };
  }, [
    todayKey,
    allLoaded,
    workouts,
    runs,
    meals,
    storedAnchor,
    restDays,
    plan,
  ]);

  const longestStreak = Math.max(currentStreak, streakData.longestStreak);

  /* What a session saved on `day` would do to the streak (`streakAcross`),
     for its post's moments. Null until every stream has loaded, and when
     one failed: the streak counted then is not the person's. */
  const streakWithDay = useCallback(
    (day: string) =>
      allLoaded && !readFailed
        ? streakAcross(
            activeDateSet,
            storedAnchor,
            day,
            parseLocalDate(todayKey),
            restDays
          )
        : null,
    [allLoaded, readFailed, activeDateSet, storedAnchor, todayKey, restDays]
  );

  // The food days (`foodDay.ts`): dates whose logged meals reach 800 kcal,
  // the days every screen counts. Feeds meal_prep_master, "Log all meals
  // for 14 days straight", which a day of a coffee and nothing else is
  // not. The active-day set (computeActiveDateSet) still takes any
  // non-empty meal: logging something keeps a streak.
  const mealDates = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const m of meals) {
      if (typeof m.date !== "string" || !m.date || m.items.length === 0)
        continue;
      byDay.set(m.date, (byDay.get(m.date) ?? 0) + (m.totalCalories ?? 0));
    }
    return [...byDay]
      .filter(([, calories]) => isFoodDay(calories))
      .map(([date]) => date);
  }, [meals]);

  // Distinct dates with a log before 7am LOCAL in the window. Uses the
  // best per-source timestamp: run completedAt (event time), workout + meal
  // createdAt (log time). Hour is read in the device timezone, consistent with
  // every other date key in this hook.
  const windowEarlyDays = useMemo(() => {
    if (!allLoaded) return [] as string[];
    return earlyDaysOf([
      ...workouts.map((w) => w.createdAt),
      ...runs.map((r) => r.completedAt),
      ...meals.map((m) => m.createdAt),
    ]);
  }, [allLoaded, workouts, runs, meals]);

  // early_bird's days for its progress ring: the ones the server's award
  // keeps on the streak document (the count outlives the window there),
  // with the window's.
  const storedEarly = streakData.earlyLogDays;
  const earlyLogDays = useMemo(
    () => (allLoaded ? keptEarlyDays(storedEarly, windowEarlyDays) : []),
    [allLoaded, storedEarly, windowEarlyDays]
  );

  // Earned badge count (excl. ultimate_athlete itself) — drives the
  // ultimate_athlete progress ring; the earning pass derives the same number
  // from the badges array via the shared helper.
  const earnedBadgeTally = useMemo(
    () => earnedBadgeCount(streakData.badges),
    [streakData.badges]
  );

  // Target-dependent nutrition badge facts: per-day intake totals (summed from
  // the meal window) joined against the per-day target snapshot + water doc.
  // Yields the macroMaster / proteinHit / waterHit date lists badgesToAward
  // consumes (macro_master / protein_pro / hydration_hero / triple_threat).
  const { macroMasterDays, proteinHitDays, waterHitDays } = useMemo(() => {
    if (!allLoaded) {
      return {
        macroMasterDays: [] as string[],
        proteinHitDays: [] as string[],
        waterHitDays: [] as string[],
      };
    }
    // Group meals by date → daily macro totals (sumMealTotals reads the
    // total*/legacy fields carried on each MealRow).
    const byDay = new Map<string, MealRow[]>();
    for (const m of meals) {
      if (!m.date) continue;
      const list = byDay.get(m.date);
      if (list) list.push(m);
      else byDay.set(m.date, [m]);
    }
    const mealTotalsByDay = new Map<string, DayMacros>();
    for (const [date, list] of byDay) {
      const totals = sumMealTotals(list);
      mealTotalsByDay.set(date, {
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
      });
    }
    return computeNutritionBadgeDays(
      mealTotalsByDay,
      macroTargetsByDay,
      waterByDay
    );
  }, [allLoaded, meals, macroTargetsByDay, waterByDay]);

  // True if the user has any logged activity (workout / run / meal with items)
  // for today's date in the device-local timezone. Shared with useStreakReminder
  // so its "hasLoggedToday" gate stays consistent with the streak computation
  // itself — both read from the same activeDateSet + same date key.
  const hasLoggedToday = useMemo(() => {
    if (!allLoaded) return false;
    return activeDateSet.has(todayKey);
  }, [allLoaded, activeDateSet, todayKey]);

  // Today is one of the plan's rest days (App1 Q32): the streak asks for
  // nothing today, so nothing reminds the person to keep it. Tomorrow too,
  // for the reminder armed today for tomorrow evening.
  const restToday = allLoaded && restDays.has(todayKey);
  const restTomorrow = useMemo(
    () =>
      allLoaded &&
      isPlannedRestDay(
        localDateString(addLocalDays(parseLocalDate(todayKey), 1)),
        plan,
        todayKey
      ),
    [allLoaded, plan, todayKey]
  );

  // Gentle after-the-fact reassurance trigger (Streak1 visibility): true only
  // when the user is active TODAY *and* yesterday was a missed day that grace
  // bridged. One-day relevance window — the moment is "you took yesterday off
  // but you're still covered". Mutually exclusive with the at-risk nudge,
  // which only shows when nothing is logged today. Never pre-emptive.
  const forgivenYesterday = useMemo(() => {
    if (!allLoaded || !hasLoggedToday) return false;
    const yesterday = yesterdayKey(new Date());
    return bridgedDates.includes(yesterday);
  }, [allLoaded, hasLoggedToday, bridgedDates]);

  // Tier B backfill discoverability (Streak1): the streak is derived from each
  // entry's own date, so logging yesterday retroactively re-anchors and (via
  // grace) can revive a freshly-broken streak. Users don't know that. We
  // surface the prompt only when it actually helps: the streak is broken
  // (currentStreak === 0), yesterday isn't already active, and SIMULATING a
  // backfill of yesterday through the same engine yields a streak worth
  // saving (>= 3). The simulation captures every rescuable shape — including
  // a one-day-older gap that grace then bridges — without re-deriving the rule.
  const backfillRescueStreak = useMemo(() => {
    if (!allLoaded || currentStreak > 0) return 0;
    const yesterday = yesterdayKey(new Date());
    if (activeDateSet.has(yesterday)) return 0;
    const augmented = new Set(activeDateSet);
    augmented.add(yesterday);
    // Through the stored pair, as the streak itself is: the window alone
    // offered a 300-day streaker the ~167 days it can see.
    const restored = computeStreakSpanAnchored(
      augmented,
      storedAnchor,
      new Date(),
      restDays
    ).streak;
    return restored >= 3 ? restored : 0;
  }, [allLoaded, currentStreak, activeDateSet, storedAnchor, restDays]);

  // Merge streakData.badges with BADGE_DEFINITIONS order (streakData.badges
  // is already in definition order from the merge above, so this is a
  // no-op alias — but explicit is clearer for consumers like BadgeGrid).
  const allBadges = streakData.badges;

  // ── Persist streak changes (loop-guarded, atomic mirror) ──────────────
  //
  // Atomic batch writes two docs in one commit:
  //   1. users/{uid}/streaks/data           — full detail (source of truth;
  //                                           owner-only).
  //   2. users/{uid}/public/profile         — cross-user-readable projection
  //                                           (see match rule in
  //                                           firestore.rules). Only the
  //                                           allowlisted fields land here.
  //
  // Mirror-write contract: streaks/data carries the full state
  // (lastActiveDate, totalActiveDays; its badges are the server's);
  // public/profile carries only the summary other people read. The profile
  // document (users/{uid}) kept a third copy of the two numbers that
  // nothing read, and no longer does (App1 Q21, Q24).

  useEffect(() => {
    // A failed read is not an empty one: with the streaks document unread,
    // longestStreak and the last active day are the defaults, and saving
    // would write them over the stored record and the public copy.
    if (!allLoaded || !uid || readFailed) return;
    const today = format(new Date(), "yyyy-MM-dd");
    // The certificate after this write: the streak through its last active
    // day, or the stored one where the streak is already broken. Never the
    // morning-after 0, which threw a long streak's certificate away.
    const anchor = anchorToStore ?? storedAnchor;
    // The last active day is the counted span's newest logged day. It was
    // "today if active, else the stored day", so a backfilled yesterday
    // saved 101 against the day before.
    const lastActiveDate = anchorToStore?.lastActiveDate ?? storedLastActive;
    // The day the streak is kept through without another log (rest days
    // ahead included), saved with the certificate it extends; a broken
    // streak leaves the stored pair, and this, as they are.
    const keptThroughToStore = anchorToStore
      ? (keptThrough ?? anchorToStore.lastActiveDate)
      : (storedKeptThrough ?? null);
    const nextLongest = Math.max(
      currentStreak,
      anchor.streak,
      streakData.longestStreak
    );
    const next = {
      currentStreak,
      lastActiveDate,
      anchorStreak: anchor.streak,
      anchorDate: anchor.lastActiveDate,
      keptThrough: keptThroughToStore,
      longestStreak: nextLongest,
    };
    const signature = JSON.stringify(next);
    if (signature === lastWrittenStreakRef.current) return;
    // Skip the first write when Firestore already holds all of it (avoids a
    // pointless write on every fresh mount).
    if (
      lastWrittenStreakRef.current === null &&
      currentStreak === storedCurrent &&
      lastActiveDate === storedLastActive &&
      (anchor.streak <= 0 ||
        (anchor.streak === storedAnchorStreak &&
          anchor.lastActiveDate === storedAnchorDate)) &&
      keptThroughToStore === (storedKeptThrough ?? null) &&
      nextLongest === streakData.longestStreak
    ) {
      lastWrittenStreakRef.current = signature;
      return;
    }

    const streaksRef = doc(db, "users", uid, "streaks", "data");
    const publicProfileRef = doc(db, "users", uid, "public", "profile");

    const batch = writeBatch(db);
    batch.set(
      streaksRef,
      {
        currentStreak,
        longestStreak: nextLongest,
        lastActiveDate,
        totalActiveDays,
        ...(anchor.streak > 0
          ? { anchorStreak: anchor.streak, anchorDate: anchor.lastActiveDate }
          : {}),
        ...(keptThroughToStore ? { keptThrough: keptThroughToStore } : {}),
      },
      { merge: true }
    );
    // Mirror onto the cross-user-readable public profile doc.
    // Readable by any authenticated user per firestore.rules match /users/{uid}/public/{doc}.
    // With the day it is kept through, so a reader can tell a streak that
    // has lapsed since this device last wrote it (publicStreakAsOf). The
    // field keeps its name, `lastActiveDate`, so the rules and every reader
    // stand as they are: it is the last logged day for a person with no
    // plan, and runs on over the plan's rest days after it for one with a
    // plan, which keep the streak (App1 Q32).
    const publicThrough = keptThroughToStore ?? lastActiveDate;
    batch.set(
      publicProfileRef,
      {
        uid,
        currentStreak,
        longestStreak: nextLongest,
        ...(typeof publicThrough === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(publicThrough)
          ? { lastActiveDate: publicThrough }
          : {}),
      },
      { merge: true }
    );

    const loggedToday = activeDateSet.has(today);
    batch
      .commit()
      .then(() => {
        lastWrittenStreakRef.current = signature;
        // Cancel any pending streak-at-risk reminder once today is logged:
        // the reminder is stale by definition then. Only then: a write on
        // the morning after a rest day is not a log, and cancelling there
        // took away the one evening the reminder exists for. The
        // useStreakReminder hook re-evaluates on the next foreground /
        // state change and reschedules if the new post-mutation state
        // still warrants a reminder (rare, but cheap to re-evaluate).
        // Intentionally swallow errors: cancel-of-nonexistent is harmless
        // and this must never block or fail the streak write. Logged at
        // warn (dev-only) in case the platform starts reporting real
        // failures we need to debug.
        if (!loggedToday) return;
        void cancelNotification(STREAK_NOTIFICATION_ID).catch((err) => {
          logger.warn("[Streaks] cancel streak-at-risk reminder failed", err);
        });
      })
      .catch((error) => {
        logger.error("[Streaks] Save failed:", error);
      });
  }, [
    allLoaded,
    uid,
    readFailed,
    currentStreak,
    anchorToStore,
    keptThrough,
    storedAnchor,
    storedCurrent,
    storedLastActive,
    storedAnchorStreak,
    storedAnchorDate,
    storedKeptThrough,
    totalActiveDays,
    activeDateSet,
    streakData.longestStreak,
  ]);

  // ── Public API ─────────────────────────────────────────────────────────

  const dismissNewBadge = useCallback(() => {
    if (uid && newBadge) dismissBadgeReveal(uid, newBadge.id);
  }, [uid, newBadge]);

  const earnedBadges = streakData.badges.filter((b) => b.earnedAt);
  const lockedBadges = streakData.badges.filter((b) => !b.earnedAt);

  // Inputs for badgeProgress(): the facts this device can see, read by the
  // client copy of the server's rules (badgeRules.cross.test.ts), so a ring
  // fills when the server would award.
  const badgeProgressCtx = useMemo(
    () => ({
      currentStreak,
      workouts,
      runs,
      mealDates,
      earlyLogDays,
      earnedBadgeCount: earnedBadgeTally,
      macroMasterDays,
      proteinHitDays,
      waterHitDays,
      today: new Date(),
    }),
    [
      currentStreak,
      workouts,
      runs,
      mealDates,
      earlyLogDays,
      earnedBadgeTally,
      macroMasterDays,
      proteinHitDays,
      waterHitDays,
    ]
  );

  // Open all four streams again after a failure.
  const retryLoad = () => {
    setStreaksDocFailed(false);
    setMealsFailed(false);
    setStreaksDocLoaded(false);
    setMealsLoaded(false);
    setStreamsAttempt((n) => n + 1);
    savedWorkouts.refresh();
    savedRuns.refresh();
  };

  return {
    currentStreak,
    /** The streak logging today keeps (see `StreakState.savable`). */
    savableStreak,
    longestStreak,
    totalActiveDays,
    /** The days the streak counts as active (a workout, a valid run or a
     *  meal with items), over the window it reads. */
    activeDates: activeDateSet,
    /** The days grace covered inside the current streak, newest first. */
    bridgedDates,
    /** The plan's rest days the current streak counts, newest first. */
    restDates,
    /** Today is one of the plan's rest days, which keep the streak. */
    restToday,
    /** Tomorrow is one of them. */
    restTomorrow,
    /** The person has a plan, so its rest days keep the streak; with no
     *  plan every day asks for a log. */
    coversRestDays: allLoaded && planHoldsSessions(plan),
    streakWithDay,
    hasLoggedToday,
    forgivenYesterday,
    backfillRescueStreak,
    loading: !allLoaded,
    /** A stream failed to load, so the figures above are not the person's. */
    loadFailed: readFailed,
    retryLoad,
    earnedBadges,
    lockedBadges,
    allBadges,
    badgeProgressCtx,
    newBadge,
    dismissNewBadge,
    // Per-day target snapshots (date → calories + macros as they stood on that
    // day). Exposed for the nutrition-insight generator (NUTR-L4) so consumers
    // ride this provider's single listener instead of mounting their own.
    macroTargetsByDay,
  };
}

// ── Context provider ────────────────────────────────────────────────────
//
// Previously each consumer (Home, BadgeGrid, useStreakReminder, Settings via
// useStreakReminder, the priming modal, ...) called `useStreaks()` directly,
// each spawning its own 4 Firestore subscriptions (streaks/data + workouts +
// runs + meals). With 3+ concurrent consumers that's 12 live listeners per
// user per session. The provider runs the hook once near the authenticated
// root; consumers read from context.

type StreaksValue = ReturnType<typeof useStreaksInternal>;

const StreaksContext = createContext<StreaksValue | null>(null);

/**
 * The profile's fields the plan's rest days are read from, held by value:
 * the provider below reads the profile only for them, so a profile write
 * that changes none of them (the streak's own mirror among them) does not
 * render every streak reader again.
 */
interface PlanProfile {
  schedule: NonNullable<StreakPlan["profile"]>;
  startKey: string | null;
}

function usePlanProfile(): PlanProfile | null {
  const { profile } = useAuth();
  const key = profile
    ? JSON.stringify([
        profile.weekSchedule ?? null,
        profile.weeklyWorkoutsTarget ?? null,
        profile.weeklyRunDaysTarget ?? null,
        profile.weeklyRunsTarget ?? null,
        startDayKey(profile.createdAt),
      ])
    : null;
  return useMemo(() => {
    if (key === null) return null;
    const [weekSchedule, workouts, runDays, runs, startKey] = JSON.parse(
      key
    ) as [
      NonNullable<StreakPlan["profile"]>["weekSchedule"] | null,
      number | null,
      number | null,
      number | null,
      string | null,
    ];
    return {
      schedule: {
        weekSchedule: weekSchedule ?? undefined,
        weeklyWorkoutsTarget: workouts ?? undefined,
        weeklyRunDaysTarget: runDays ?? undefined,
        weeklyRunsTarget: runs ?? undefined,
      },
      startKey,
    };
  }, [key]);
}

const StreaksState = memo(function StreaksState({
  planProfile,
  children,
}: {
  planProfile: PlanProfile | null;
  children: ReactNode;
}) {
  const value = useStreaksInternal(planProfile);
  return (
    <StreaksContext.Provider value={value}>{children}</StreaksContext.Provider>
  );
});

export function StreaksProvider({ children }: { children: ReactNode }) {
  const planProfile = usePlanProfile();
  return <StreaksState planProfile={planProfile}>{children}</StreaksState>;
}

/**
 * Read the streaks state populated by the single <StreaksProvider> higher
 * up the tree. Throws if called outside the provider — that would mean
 * either (a) the provider hasn't been mounted yet (e.g. on auth / onboarding
 * screens — which is deliberate, we don't subscribe until the user is in),
 * or (b) someone regressed by rendering a streak-consuming component
 * outside the authenticated branch.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useStreaks(): StreaksValue {
  const ctx = use(StreaksContext);
  if (!ctx) {
    throw new Error(
      "useStreaks must be used inside <StreaksProvider> (authenticated routes only)"
    );
  }
  return ctx;
}

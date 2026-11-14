/**
 * How long has the runner actually been away?
 *
 * THE GAP THIS FILLS. `RacePlanV2Input` described the RACE (distance, date,
 * weeks remaining) and the user's static PREFERENCES (`RunTuning`), but
 * nothing about what they had actually run. So the plan derived entirely from
 * weeks-to-race and could not tell a runner who trained ten weeks from one who
 * trained zero.
 *
 * Measured on a marathon plan (2026-08-04), same runner, same race date:
 *
 *     fresh, 16 weeks out   easy_30 | easy_30 | long_12k
 *     back after 10 weeks   tempo_40 | easy_40 | long_25k
 *
 * A 25 km long run and a 40-minute tempo in week one back — double the longest
 * run they were ever prescribed. For running that is the "too much too soon"
 * that produces stress fractures and tendinopathy, not merely a hard week.
 *
 * WHY THE LIFT FIX DOES NOT TRANSFER. `Lift1` holds `weekNumber` for a week
 * nobody trained, because a mesocycle accumulates training. A race date is
 * fixed — it arrives whether or not you trained — so the plan cannot hold. The
 * answer is a re-entry policy, and a policy needs this input.
 *
 * THRESHOLDS — sourced, not picked.
 *
 *   - Under ~10 days there is little measurable aerobic decline in trained
 *     runners, so a missed week is a scheduling problem rather than a fitness
 *     one. That is `gap`: the existing fell-behind realign is the right answer.
 *   - By 2 weeks VO2max is down ~6%; 8-20% across 4-9 weeks; ~19% at 9.
 *   - **21 days is the line**, which is Runna's own: past 21 days away it stops
 *     offering to realign and recommends starting a new plan, "as your fitness
 *     level may change during that time". Deliberately the same number — it is
 *     what an app with far more running data converged on, and it sits inside
 *     the window the physiology describes.
 *
 * REFERENCE APPS (2026-08-04 audit). No dominant app resumes a returning
 * runner mid-block. Garmin Coach adapts continuously from observed data and
 * pulls back when sessions are missed; Runna grades a realignment prompt by
 * how much was missed; Nike Run Club ships separate comeback plans. Silent
 * resumption was the one behaviour none of them had, and it was ours.
 *
 * This module REPORTS. It does not prescribe — the policy lives in the
 * generator, which is the only place that knows what a week should contain.
 */
import { isVolumeEligible, type RunRecord } from "@/lib/runStatsEligibility";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

/**
 * Days away past which the plan's assumption about the runner's fitness is no
 * longer safe to act on. Matches Runna's 21-day line — see the module header
 * for why this number rather than a rounder one.
 */
export const LAYOFF_DETRAINED_DAYS = 21;

/** Days away that count as having missed training, short of detraining. */
export const LAYOFF_GAP_DAYS = 7;

/**
 * How long a runner keeps being treated as returning AFTER their first run
 * back.
 *
 * WITHOUT THIS THE POLICY LASTS EXACTLY ONE WEEK. Days-since-last-run is zero
 * the moment they run, so a ten-week layoff cleared itself on the first easy
 * session and the very next regeneration handed back the full-volume week.
 * Measured on a 6-weeks-out marathon: `long_12k` in the re-entry week, then
 * `long_25k` the following week — the same doubling this module exists to
 * prevent, delayed by seven days.
 *
 * 21 days is the same line as {@link LAYOFF_DETRAINED_DAYS}, deliberately: the
 * window you need to rebuild is not shorter than the window that cost you the
 * fitness. It also matches what the reference apps prescribe — Runna hands
 * back a NEW plan, Nike Run Club ships multi-week comeback plans. None of them
 * resume peak volume after one session, which is what a recency-only test does.
 */
export const LAYOFF_REENTRY_DAYS = 21;

/**
 * How the plan should treat the runner's absence.
 *
 *   - `none`      — training recently; the plan's assumptions hold.
 *   - `gap`       — away long enough to have missed sessions, not long enough
 *                   for fitness to have moved. A scheduling problem: realign.
 *   - `detrained` — away long enough that the plan is written for someone who
 *                   no longer exists. Resuming mid-block is the unsafe case.
 */
export type LayoffClass = "none" | "gap" | "detrained";

/** A run, as far as this module is concerned: a date plus enough to judge
 *  whether it counted. Deliberately structural — callers pass Firestore
 *  payloads, `SavedRunDoc`, or test fixtures without adapting. */
export interface DatedRun extends RunRecord {
  /** Local "YYYY-MM-DD". */
  date?: string;
  /** What was run, as the saved run names it (`SavedRun.templateId`). */
  templateId?: string;
  /** The run's work was at a pace the plan pinned (`SavedRun
   *  .workPacePinned`): a goal-pace tempo, a long run's race-pace work. */
  workPacePinned?: boolean;
}

/** The kinds of run whose pace is quicker than the runner's own on
 *  purpose. */
const SESSION_TYPES: ReadonlySet<string> = new Set([
  "race",
  "tempo",
  "intervals",
]);

/**
 * Run24 (2), (4): whether a run's pace is the pace the runner runs most of
 * their running at, the one a race block is sized at (`recentPace`). Not a
 * race, a time trial, a tempo or an interval session, by the run's own type
 * or its plan's session, whose average is quicker on purpose, nor a run
 * whose work was at a pace the plan pinned. A run that names neither, a
 * free run among them, counts. Read with all the runs, a month of an easy
 * run, a long run and a time trial or a session each week read the runner
 * 30 s/km quicker than their own running, and started the block's long
 * run a rung longer than their longest run.
 */
export function runsAtOwnPace(run: DatedRun): boolean {
  if (run.activityType && SESSION_TYPES.has(run.activityType)) return false;
  if (run.workPacePinned) return false;
  const type = run.templateId
    ? RUN_TEMPLATES.find((t) => t.id === run.templateId)?.type
    : undefined;
  return !type || !SESSION_TYPES.has(type);
}

/**
 * The days a run that counts was saved on, one per run, in no order: the
 * running half of the one return check (`trainingReturn.ts`, App1 Q35).
 *
 * Eligibility routes through the shared `isVolumeEligible` rather than a local
 * predicate, so an invalid / saved-anyway / sub-threshold run cannot read as
 * "still training" here while being excluded from every other volume surface.
 * That predicate has a server mirror (`isVolumeEligibleRun`); a second private
 * copy here is exactly the drift CLAUDE.md's tested-copy rule warns about.
 */
export function runSessionDays(runs: readonly DatedRun[]): string[] {
  const days: string[] = [];
  for (const run of runs ?? []) {
    if (run?.date && isVolumeEligible(run)) days.push(run.date);
  }
  return days;
}

/** The latest of some "YYYY-MM-DD" days, or null with none.
 *  Lexicographic max is safe and cheap for the format. */
function lastDayOf(days: readonly string[]): string | null {
  let latest: string | null = null;
  for (const day of days) if (latest === null || day > latest) latest = day;
  return latest;
}

/** Whole days from `fromKey` to `todayKey`, never below 0: a session dated
 *  ahead of today (clock skew, a back-filled entry) is not a layoff. */
function wholeDaysTo(fromKey: string, todayKey: string): number {
  const from = parseLocalDate(fromKey).getTime();
  const today = parseLocalDate(todayKey).getTime();
  return Math.max(0, Math.round((today - from) / 86_400_000));
}

/**
 * Map days-away onto the policy classes above.
 *
 * `null` (never trained) is `none`, not `detrained`: a brand-new user has
 * not lapsed, they have not started, and a fresh plan for a fresh runner is
 * already the right plan.
 * Treating it as a layoff would hand every first-time race-prep user a
 * re-entry plan on the day they created their goal.
 */
export function classifyLayoff(daysAway: number | null): LayoffClass {
  if (daysAway === null) return "none";
  if (daysAway >= LAYOFF_DETRAINED_DAYS) return "detrained";
  if (daysAway >= LAYOFF_GAP_DAYS) return "gap";
  return "none";
}

/**
 * Is the runner INSIDE a re-entry window — i.e. did a detraining-length gap
 * end recently enough that they are still rebuilding?
 *
 * Looks for two consecutive sessions of the sport (eligible runs, or lifts
 * with work in them) separated by
 * {@link LAYOFF_DETRAINED_DAYS} or more, where the LATER of the two (their
 * first run back) falls within {@link LAYOFF_REENTRY_DAYS} of today.
 *
 * A runner with only one eligible run ever has no pair and so is never
 * mid-re-entry — correct, and the same call the `null` case makes: someone
 * taking their first ever run has not come back from anything.
 *
 * A consistent light trainer (2×/week, or even 1×/week) never has a
 * 21-day gap, so this cannot misfire on them. CLAUDE.md's design-for-the-
 * user-base rule makes that segment a first-class case, not an exception —
 * a volume-density test would have caught them, which is why this keys on
 * gaps rather than on how much they run.
 */
function isInReentryWindow(days: readonly string[], todayKey: string): boolean {
  const dates = [...days].sort().reverse();
  const today = parseLocalDate(todayKey).getTime();

  for (let i = 0; i < dates.length - 1; i++) {
    const back = parseLocalDate(dates[i]).getTime();
    const before = parseLocalDate(dates[i + 1]).getTime();
    const daysSinceBack = Math.round((today - back) / 86_400_000);
    // Runs newer than the window can't be a first-run-back we still care
    // about; keep walking until one is inside it.
    if (daysSinceBack > LAYOFF_REENTRY_DAYS) return false;
    if (Math.round((back - before) / 86_400_000) >= LAYOFF_DETRAINED_DAYS) {
      return true;
    }
  }
  return false;
}

/** How long one sport has gone untrained, under the one rule both sports
 *  share (App1 Q35, `trainingReturn.ts`). */
export interface SportAbsence {
  /** The last day the sport was trained; null when it never has been. */
  lastDay: string | null;
  /** Whole days since then; null when never. Never is not a layoff. */
  daysAway: number | null;
  /** The gap under the shared policy, re-entry window included. */
  layoff: LayoffClass;
}

/**
 * The one return rule, for either sport, from the days it was trained.
 *
 * Two ways to be `detrained`: currently away past the threshold, or back but
 * still inside the re-entry window. The second is what makes this a policy
 * rather than a one-week pause — see {@link LAYOFF_REENTRY_DAYS}.
 */
export function absenceFromDays(
  days: readonly string[],
  todayKey: string
): SportAbsence {
  const lastDay = lastDayOf(days);
  const daysAway = lastDay === null ? null : wholeDaysTo(lastDay, todayKey);
  const byRecency = classifyLayoff(daysAway);
  const layoff =
    byRecency === "detrained" || isInReentryWindow(days, todayKey)
      ? "detrained"
      : byRecency;
  return { lastDay, daysAway, layoff };
}

/**
 * The runner's layoff class from their run history: the running half of
 * the one return check, by its one rule (`absenceFromDays`). The race
 * plan's re-entry reads it, and Home's run return reads the same rule.
 */
export function layoffFromRuns(
  runs: readonly DatedRun[],
  todayKey: string
): LayoffClass {
  return absenceFromDays(runSessionDays(runs), todayKey).layoff;
}

/**
 * The Monday of the week a runner came back in after a detraining-length
 * gap (Run15, deep dive D11): the week of their first
 * eligible run after it, or the week of `asOfKey` while they are still away
 * (they come back in it). Null when no such gap shows in the runs read: a
 * runner who has run steadily, or whose return is now older than the runs
 * the read holds, has nothing to climb back from. The race plan climbs its
 * long run back from this week, a rung a week from below base.
 */
export function returnWeekKey(
  runs: readonly DatedRun[],
  asOfKey: string
): string | null {
  const dates = [
    ...new Set(
      (runs ?? [])
        .filter((r) => r?.date && isVolumeEligible(r) && r.date <= asOfKey)
        .map((r) => r.date as string)
    ),
  ].sort();
  if (dates.length === 0) return null;
  const days = (from: string, to: string) =>
    Math.round(
      (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) /
        86_400_000
    );
  if (days(dates[dates.length - 1], asOfKey) >= LAYOFF_DETRAINED_DAYS)
    return localWeekKey(parseLocalDate(asOfKey));
  for (let i = dates.length - 1; i > 0; i--)
    if (days(dates[i - 1], dates[i]) >= LAYOFF_DETRAINED_DAYS)
      return localWeekKey(parseLocalDate(dates[i]));
  return null;
}

/*
 * What the recent runs say was done, for a running starting point that
 * climbs from what was done rather than from the calendar
 * (`runningClimb`). The runs are the ones the layoff is read from
 * (`fetchRecentRunning`, the latest `RECENT_RUN_SCAN_LIMIT`); someone
 * running every day for four weeks has more than that read holds, and the
 * oldest then go unseen, which can only make the longest run read shorter.
 */

const shiftDays = (key: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(key), days));

const eligibleRuns = (runs: readonly DatedRun[]) =>
  runs.filter((run) => !!run?.date && isVolumeEligible(run));

/**
 * A week is done with two or more saved runs dated in it, as Run9a's
 * starter counts a week ("with two a week, both"). One definition, read by
 * the running starting point's climb and there for the starter's stages.
 */
export const DONE_WEEK_RUNS = 2;

/** How far back a run counts as recent: four weeks, the window the running
 *  starting point is filled from (`recentRunningContext`). */
export const RECENT_RUN_DAYS = 28;

/** Whether the week starting `weekKey` was done: `DONE_WEEK_RUNS` or more
 *  saved runs dated in it, or every run of a plan with fewer run days
 *  (`runDays`): a plan on one run day a week is done with its one run, or
 *  its running could never climb. */
export function isWeekDone(
  runs: readonly DatedRun[],
  weekKey: string,
  runDays: number = DONE_WEEK_RUNS
): boolean {
  const last = shiftDays(weekKey, 6);
  return (
    eligibleRuns(runs).filter(
      (run) => run.date! >= weekKey && run.date! <= last
    ).length >= Math.max(1, Math.min(DONE_WEEK_RUNS, runDays))
  );
}

/**
 * The runs of the `RECENT_RUN_DAYS` before `beforeKey`: the longest one's
 * minutes, the farthest one's km, the most minutes one of its four weeks
 * ran besides that week's longest run, and the pace of those run at the
 * runner's own pace together (`runsAtOwnPace`, seconds a km), each null
 * with none; and whether the last of those weeks was done (`isWeekDone`,
 * for a plan of `runDays` run days a week). The weeks are the seven days
 * ending at `beforeKey`, the seven before them, and so on. A pace outside
 * 2:30 to 20:00 a km is a recording, not a run, and is left out.
 */
export function recentRunning(
  runs: readonly DatedRun[],
  beforeKey: string,
  runDays: number = DONE_WEEK_RUNS
): {
  longestMinutes: number | null;
  longestKm: number | null;
  otherMinutes: number | null;
  paceSPerKm: number | null;
  lastWeekDone: boolean;
} {
  const from = shiftDays(beforeKey, -RECENT_RUN_DAYS);
  const lastWeekDone = isWeekDone(runs, shiftDays(beforeKey, -7), runDays);
  const recent = eligibleRuns(runs).filter(
    (run) => run.date! >= from && run.date! < beforeKey
  );
  if (recent.length === 0)
    return {
      longestMinutes: null,
      longestKm: null,
      otherMinutes: null,
      paceSPerKm: null,
      lastWeekDone,
    };
  const minutes = (run: DatedRun) => (run.duration ?? 0) / 60;
  // Run24 (2), (4): the pace of the runner's own running, not a session's.
  const ownPace = recent.filter(runsAtOwnPace);
  const seconds = ownPace.reduce((sum, run) => sum + (run.duration ?? 0), 0);
  const km = ownPace.reduce((sum, run) => sum + (run.distance ?? 0), 0) / 1000;
  const pace = km > 0 ? seconds / km : NaN;
  const weeks = Array.from({ length: RECENT_RUN_DAYS / 7 }, (_, i) => {
    const start = shiftDays(beforeKey, -7 * (i + 1));
    const end = shiftDays(beforeKey, -7 * i);
    return recent
      .filter((run) => run.date! >= start && run.date! < end)
      .map(minutes);
  });
  return {
    longestMinutes: Math.max(...recent.map(minutes)),
    longestKm: Math.max(...recent.map((run) => (run.distance ?? 0) / 1000)),
    otherMinutes: Math.max(
      ...weeks.map((week) =>
        week.length === 0
          ? 0
          : week.reduce((sum, m) => sum + m, 0) - Math.max(...week)
      )
    ),
    paceSPerKm: pace >= 150 && pace <= 1200 ? pace : null,
    lastWeekDone,
  };
}

/** The pace of the runs of the `RECENT_RUN_DAYS` to `todayKey`, today's
 *  included (`recentRunning`). */
export function recentPace(
  runs: readonly DatedRun[],
  todayKey: string
): number | null {
  return recentRunning(runs, shiftDays(todayKey, 1)).paceSPerKm;
}

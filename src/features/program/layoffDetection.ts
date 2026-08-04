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
import { parseLocalDate } from "@/lib/dateHelpers";

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
}

/**
 * Whole days since the runner's most recent VOLUME-ELIGIBLE run, or `null`
 * when they have never logged one.
 *
 * Eligibility routes through the shared `isVolumeEligible` rather than a local
 * predicate, so an invalid / saved-anyway / sub-threshold run cannot read as
 * "still training" here while being excluded from every other volume surface.
 * That predicate has a server mirror (`isVolumeEligibleRun`); a second private
 * copy here is exactly the drift CLAUDE.md's tested-copy rule warns about.
 *
 * `null` — never run — is NOT zero and NOT infinity. A brand-new user has not
 * lapsed; they have not started. `classifyLayoff` maps it to `none`, because a
 * fresh plan for a fresh runner is already the right plan.
 */
export function daysSinceLastRun(
  runs: readonly DatedRun[],
  todayKey: string
): number | null {
  let latest: string | null = null;
  for (const run of runs ?? []) {
    if (!run?.date || !isVolumeEligible(run)) continue;
    // Lexicographic max is safe and cheap for "YYYY-MM-DD".
    if (latest === null || run.date > latest) latest = run.date;
  }
  if (latest === null) return null;

  const last = parseLocalDate(latest).getTime();
  const today = parseLocalDate(todayKey).getTime();
  // A run dated in the future (clock skew, a back-filled manual entry) is not
  // a layoff. Clamp at 0 rather than reporting negative days away.
  return Math.max(0, Math.round((today - last) / 86_400_000));
}

/**
 * Map days-away onto the policy classes above.
 *
 * `null` (never run) is `none`, not `detrained` — see `daysSinceLastRun`.
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
 * Looks for two consecutive eligible runs separated by
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
function isInReentryWindow(
  runs: readonly DatedRun[],
  todayKey: string
): boolean {
  const dates = (runs ?? [])
    .filter((r) => r?.date && isVolumeEligible(r))
    .map((r) => r.date as string)
    .sort()
    .reverse();
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

/**
 * The runner's layoff class from their run history.
 *
 * Two ways to be `detrained`: currently away past the threshold, or back but
 * still inside the re-entry window. The second is what makes this a policy
 * rather than a one-week pause — see {@link LAYOFF_REENTRY_DAYS}.
 */
export function layoffFromRuns(
  runs: readonly DatedRun[],
  todayKey: string
): LayoffClass {
  const byRecency = classifyLayoff(daysSinceLastRun(runs, todayKey));
  if (byRecency === "detrained") return byRecency;
  return isInReentryWindow(runs, todayKey) ? "detrained" : byRecency;
}

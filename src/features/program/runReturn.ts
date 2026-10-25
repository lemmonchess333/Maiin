/**
 * A runner's welcome back: whether Home greets someone coming back to
 * running, and what it offers them.
 *
 * The lifter's twin is `liftLayoff.ts`, and this keeps its two lines rather
 * than drawing new ones. Both are imported, not copied:
 *
 *   - From two weeks away (`WELCOME_BACK_DAYS`), a free runner is offered an
 *     easy run. Nothing about their running is planned, so nothing changes;
 *     the greeting and one easy first run are the whole of it.
 *   - From three weeks away (`LAYOFF_DETRAINED_DAYS`), a race plan opens the
 *     fell-behind sheet in its welcome-back register. That sheet says the
 *     plan will ease the runner back in, and a rebuild does so only from
 *     that line, where the generator plans re-entry weeks. Between the two
 *     lines a race plan's gap is a scheduling miss, which the weekly check's
 *     realign already answers.
 *
 * Only someone whose plan has running in it is greeted (`runningPlan`), and
 * only once they have a run to be back from: a new account has none, and a
 * lift-only plan has nothing to return to.
 *
 * The absence is measured from saved runs through the shared eligibility
 * rule (`lastRunDay`), the same runs and rule the race plan's re-entry
 * measures, so the sheet's words and the plan a rebuild makes agree.
 *
 * This module REPORTS. Home shows the surface and the sheets act; no plan
 * changes here.
 */
import type { UserProfile } from "@/lib/auth";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import type { ProgramState } from "./programTypes";
import { WELCOME_BACK_DAYS } from "./liftLayoff";
import {
  classifyLayoff,
  daysSinceLastRun,
  lastRunDay,
  type DatedRun,
} from "./layoffDetection";

/**
 * What the person's running is, as far as a welcome back cares.
 *
 *   - `none`: no running in the plan (a lift-only programme).
 *   - `free`: running with no race ahead: free running, or a race plan
 *     whose race has passed or is in its recovery weeks.
 *   - `race`: a race still ahead, which the plan builds toward and a
 *     rebuild can re-plan from today.
 */
export type RunningPlan = "none" | "free" | "race";

/** What the welcome back offers: an easy run, or the race plan's rebuild. */
export type RunReturnOffer = "easy-run" | "rebuild";

export interface RunReturnAssessment {
  /** Whole days since the last run that counts; null with no such run, or
   *  while the runs are not yet known. */
  daysAway: number | null;
  /**
   * Dismissal identity for this absence: the day of the last run that
   * counts. A later absence has a later last run, so it asks again; a key
   * based on today would ask again tomorrow.
   */
  dismissKey: string | null;
  /** What Home offers, or null when it greets no one. */
  offer: RunReturnOffer | null;
}

/** The easy run the free runner's welcome back starts: Easy 20, the short
 *  easy run in the library, at conversational effort. */
export const RETURN_RUN_TEMPLATE_ID = "easy_20";

type RunningProfile = Pick<
  UserProfile,
  "athleteType" | "runMode" | "raceGoal" | "weekSchedule"
>;

/**
 * Whether the plan has running in it, and of which kind.
 *
 * A race counts while its rebuild could run: race prep with a race on the
 * profile, before race day and outside the recovery weeks after it, which
 * are the refusals `realignRacePlan` makes. Free running has no planned
 * days, so the athlete type says it (the rule `todaySession` offers a free
 * runner's run on); a week with a run day in it says it for anyone else.
 */
export function runningPlan(
  profile: RunningProfile | null | undefined,
  programState: ProgramState | null | undefined,
  todayKey: string
): RunningPlan {
  if (!profile) return "none";
  if (profile.runMode === "race_prep" && profile.raceGoal) {
    const plan = resolveRunPlan(profile, programState, todayKey);
    if (!plan.isElapsed && !plan.inRecovery) return "race";
    return "free";
  }
  if (profile.athleteType === "Runner" || profile.athleteType === "Hybrid")
    return "free";
  if (profile.runMode === "race_prep" || profile.runMode === "structured")
    return "free";
  const runDay = (profile.weekSchedule ?? []).some(
    (day) => day?.type === "run" || day?.type === "both"
  );
  return runDay ? "free" : "none";
}

/**
 * Whether Home greets this runner, from their plan and their runs.
 *
 * `runs` is null until the read is confirmed by the server: a cached list
 * can be missing the run someone logged on another phone yesterday, and a
 * welcome back to a person who never left is the one thing this must not
 * say.
 */
export function assessRunReturn(input: {
  plan: RunningPlan;
  runs: readonly DatedRun[] | null;
  todayKey: string;
}): RunReturnAssessment {
  const { plan, runs, todayKey } = input;
  if (runs === null) return { daysAway: null, dismissKey: null, offer: null };
  const daysAway = daysSinceLastRun(runs, todayKey);
  const dismissKey = lastRunDay(runs);
  return { daysAway, dismissKey, offer: offerFor(plan, daysAway) };
}

function offerFor(
  plan: RunningPlan,
  daysAway: number | null
): RunReturnOffer | null {
  if (daysAway === null) return null;
  if (plan === "race")
    return classifyLayoff(daysAway) === "detrained" ? "rebuild" : null;
  if (plan === "free") return daysAway >= WELCOME_BACK_DAYS ? "easy-run" : null;
  return null;
}

/**
 * The absence as the sheet says it: weeks for the first two months, then
 * months, then "more than a year". A count of days invites arithmetic, and
 * fifty weeks reads as a sum rather than a time.
 */
export function returnGap(daysAway: number): string {
  if (daysAway >= 365) return "more than a year";
  if (daysAway < 63) return `about ${Math.round(daysAway / 7)} weeks`;
  return `about ${Math.min(11, Math.round(daysAway / 30.44))} months`;
}

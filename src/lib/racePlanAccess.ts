/**
 * Race plans for the half and the full marathon are Pro after their first
 * week (whole-app grill Q85, owner, 13 November 2026: "Race plans (half and
 * full marathon) are Pro after their first week, as Runna sells them;
 * general training and the 5K starter stay free"). It overturns Q7, "all
 * training stays free".
 *
 * What stays free, always: recording any run, general training, the 5K
 * starter, a 5K or 10K race plan, the plan's first week (and the lead-in
 * days before it, which are week 0 too), the race itself, and the recovery
 * weeks after it (anything that protects a person stays free, Q46). The
 * plan keeps moving week by week for a free account, so taking Pro lands
 * on the week the race needs.
 *
 * The free week is once per account. A new race goal makes a new plan that
 * starts at week 0 again, so the first time a free account's plan passes
 * its free week the app records it on the profile
 * (`racePlanFreeWeekUsed`, written by `useRacePlanLocked`), and from then
 * on a later half or full marathon plan's first week is past it too. The
 * profile, not the programme document, holds it: a new race goal and setup
 * both replace the programme document whole, and neither touches that field.
 */

/** The race distances whose plans are Pro after week 1. */
const PRO_RACE_DISTANCES: ReadonlySet<string> = new Set(["half", "marathon"]);

/** Where a locked plan session leads. */
export const RACE_PLAN_UPGRADE_PATH = "/upgrade?from=race_plan";

export interface RacePlanLockInput {
  isPro: boolean;
  /** `programState.runPlan`, as stored. */
  runPlan:
    | {
        mode?: string;
        currentWeek?: number;
        phase?: string;
        raceGoal?: { distance?: string } | null;
      }
    | null
    | undefined;
  /** `profile.raceGoal.distance`, the canonical copy; the plan's own copy
   *  stands in when the profile has none. */
  raceDistance?: string | null;
  /** `profile.racePlanFreeWeekUsed`: the account has had its free week of a
   *  half or full marathon plan, so this plan's first week is past it. */
  freeWeekUsed?: boolean;
}

/** Whether this account's race plan has passed the week it may use free. */
export function racePlanLocked(input: RacePlanLockInput): boolean {
  if (input.isPro) return false;
  const plan = input.runPlan;
  if (!plan || plan.mode !== "race_prep") return false;
  if (plan.phase === "recovery") return false;
  const distance = input.raceDistance ?? plan.raceGoal?.distance ?? null;
  if (!distance || !PRO_RACE_DISTANCES.has(distance)) return false;
  if (input.freeWeekUsed) return true;
  return (plan.currentWeek ?? 0) >= 1;
}

/** Whether the account's free week is used up now and not yet recorded:
 *  the plan is past its free week on its own, the moment
 *  `racePlanLocked` is first true for it. */
export function racePlanFreeWeekToRecord(input: RacePlanLockInput): boolean {
  return !input.freeWeekUsed && racePlanLocked(input);
}

/** Whether a planned run on a locked plan still starts: the race itself
 *  does, whatever the plan. */
export function lockedPlanRunStarts(templateType: string | null | undefined) {
  return templateType === "race";
}

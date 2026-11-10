/**
 * A run from an earlier week still on this phone, unsaved. The automatic
 * week rollover waits on it (`useProgram`), as it waits on a lift session
 * open on this device (`openLiftSession`).
 */
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import {
  readStoredRunSummary,
  RUN_RESUME_MAX_AGE_MS,
} from "@/lib/runResumeStorage";

/**
 * A run started before this week and not yet saved: still recording past
 * Sunday midnight, or finished and waiting on its summary. Saved, it is
 * dated by its start and counts for the week it began in, so that week is
 * not weighed without it: rolled first, a plan whose week needed that run
 * did not climb, and the run reached a week already closed.
 *
 * Held only while the run is fresh, written in the last six hours (the
 * stored run's own cutoff for one in progress). A summary left unsaved for
 * days, which the phone keeps for a week, does not hold the plan back.
 */
export function earlierWeeksRunOnPhone(
  uid: string,
  todayKey: string,
  now: number = Date.now()
): boolean {
  const stored = readStoredRunSummary(uid, now);
  if (!stored || now - stored.lastWriteAt > RUN_RESUME_MAX_AGE_MS) return false;
  const startDay =
    stored.identity?.startLocalDate ??
    localDateString(new Date(stored.startedAt));
  return startDay < localWeekKey(parseLocalDate(todayKey));
}

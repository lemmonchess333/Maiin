/**
 * Sessions still on this phone that the automatic week rollover waits on
 * (`useProgram`), as it waits on a lift session open on this device
 * (`openLiftSession`): a run from an earlier week not yet saved, and a
 * lift from the plan's week the app was closed partway through.
 *
 * Each holds the plan only while it is fresh, written in the last six
 * hours (the stored run's own cutoff for one in progress). A session left
 * for days does not hold the plan back.
 */
import { listWorkoutDrafts } from "@/hooks/useWorkoutDraft";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import {
  readStoredRunSummary,
  RUN_RESUME_MAX_AGE_MS,
} from "@/lib/runResumeStorage";
import type { ProgramState } from "./programTypes";
import { countedSets } from "./setLabels";

/** How long a session on this phone holds the plan, from its last write. */
const HOLD_MS = RUN_RESUME_MAX_AGE_MS;

/**
 * A run started before this week and not yet saved: still recording past
 * Sunday midnight, or finished and waiting on its summary. Saved, it is
 * dated by its start and counts for the week it began in, so that week is
 * not weighed without it: rolled first, a plan whose week needed that run
 * did not climb, and the run reached a week already closed. The phone
 * keeps an unsaved summary for a week; it holds the plan for six hours.
 */
export function earlierWeeksRunOnPhone(
  uid: string,
  todayKey: string,
  now: number = Date.now()
): boolean {
  const stored = readStoredRunSummary(uid, now);
  if (!stored || now - stored.lastWriteAt > HOLD_MS) return false;
  const startDay =
    stored.identity?.startLocalDate ??
    localDateString(new Date(stored.startedAt));
  return startDay < localWeekKey(parseLocalDate(todayKey));
}

/**
 * A lift from the plan's week the app was closed partway through, with a
 * working set done: Home and Train offer it to resume (`resumableLift`).
 * Its draft is kept for the plan's week (its identity names the week and
 * the day), so once the week rolled it was no longer offered, and the sets
 * done on Sunday night were lost.
 *
 * Read from the draft's identity rather than through `resumableLift`,
 * which brings the In progress strip's modules into every page that
 * mounts the plan; a draft whose day was rebuilt since holds the week
 * no longer than six hours either way.
 */
export function planWeeksLiftOnPhone(
  uid: string,
  programState: Pick<ProgramState, "workouts" | "weekNumber">,
  now: number = Date.now()
): boolean {
  return listWorkoutDrafts(uid).some((draft) => {
    if (draft.completionPending || now - draft.savedAt > HOLD_MS) return false;
    const [version, scope, epoch, day] = draft.identity.split("|");
    if (
      version !== "v1" ||
      !scope?.startsWith("programme") ||
      epoch !== `e${programState.weekNumber}` ||
      day !== `d${draft.dayIndex}`
    )
      return false;
    const planned = programState.workouts?.[draft.dayIndex];
    if (!planned || planned.completed || planned.skipped) return false;
    return countedSets(draft.setLogs.flat()).some((set) => set.completed);
  });
}

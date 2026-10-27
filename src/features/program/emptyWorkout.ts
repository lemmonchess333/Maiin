import type { WorkoutDay } from "./programTypes";
import {
  computeDraftIdentity,
  type WorkoutDraft,
} from "@/hooks/useWorkoutDraft";
import { RESUME_PARAM } from "@/lib/resumeParam";

/**
 * An empty workout (Mob1 call 1): a lift with no plan day behind it, the
 * lifting peer of Free run. It opens with no exercises, grows by "Add
 * exercise", and saves as a workout of its own (`source: "free"`) that
 * moves nothing in the plan: no day is marked done and no lift steps.
 * It counts in the week as any saved lift does (`trainingWeek`).
 *
 * Its page and the screens that offer one back (`sessionsInFlight`) both
 * name its draft from here, so a Resume opens the same session.
 */

/** Where an empty workout runs. */
export const EMPTY_WORKOUT_PATH = "/empty-workout";

/** The day an empty workout runs as: programme days are 0 to 6 and a
 *  routine's is -1, so its draft takes neither's place. */
export const EMPTY_WORKOUT_DAY_INDEX = -2;

const SCOPE = "empty";
const EPOCH = 0;

/** The draft scope of an empty workout: one under way at a time. */
export const EMPTY_WORKOUT_DRAFT_SCOPE = SCOPE;
export const EMPTY_WORKOUT_DRAFT_EPOCH = EPOCH;

/** Its name, on the session and on the saved workout. */
export const EMPTY_WORKOUT_NAME = "Workout";

/** The day the workout screen runs for an empty workout. */
export function emptyWorkoutDay(): WorkoutDay {
  return {
    dayName: EMPTY_WORKOUT_NAME,
    dayType: "lift",
    exercises: [],
    completed: false,
  };
}

/** The identity the workout screen gives an empty workout's draft. What
 *  is added later is in the draft, not in its name, so one draft is
 *  always the empty workout's. */
export function emptyWorkoutDraftIdentity(): string {
  return computeDraftIdentity({
    scope: SCOPE,
    epoch: EPOCH,
    dayIndex: EMPTY_WORKOUT_DAY_INDEX,
    dayName: EMPTY_WORKOUT_NAME,
    layout: [],
  });
}

/** Whether a draft is an empty workout's. */
export function isEmptyWorkoutDraft(
  draft: Pick<WorkoutDraft, "identity">
): boolean {
  return draft.identity === emptyWorkoutDraftIdentity();
}

/** Where Resume opens an empty workout under way: its page, which
 *  carries on without asking again. */
export function emptyWorkoutResumeTarget(): string {
  return `${EMPTY_WORKOUT_PATH}?${RESUME_PARAM}=1`;
}

/** Which writer saves a session of a draft scope: its workout id's
 *  prefix (`liftWorkoutId`). */
export function workoutSourceForScope(
  scope: string | undefined
): "programme" | "routine" | "free" {
  if (scope === SCOPE) return "free";
  return scope?.startsWith("routine:") ? "routine" : "programme";
}

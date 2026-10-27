import type { WorkoutDay } from "./programTypes";
import {
  computeDraftIdentity,
  draftIdentityScope,
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
 * Each empty workout is a session of its own, named in its page's address
 * (`?session=`), so its draft has a key of its own: a finished one still
 * waiting for the server (queued offline, or refused) never stands in the
 * way of the next. Its page and the screens that offer one back
 * (`sessionsInFlight`) both name its draft from here, so a Resume opens
 * the same session.
 */

/** Where an empty workout runs. */
export const EMPTY_WORKOUT_PATH = "/empty-workout";

/** The address parameter that names the session. */
export const EMPTY_WORKOUT_SESSION_PARAM = "session";

/** The day an empty workout runs as: programme days are 0 to 6 and a
 *  routine's is -1, so its draft takes neither's place. */
export const EMPTY_WORKOUT_DAY_INDEX = -2;

const SCOPE_PREFIX = "empty:";

/** Empty workouts' drafts have no epoch: each session is its own. */
export const EMPTY_WORKOUT_DRAFT_EPOCH = 0;

/** Its name, on the session and on the saved workout. */
export const EMPTY_WORKOUT_NAME = "Workout";

/** A session id an address can carry and a draft's identity can hold:
 *  letters, digits and dashes, as a minted id has. */
export function isEmptyWorkoutSessionId(
  value: string | null | undefined
): value is string {
  return !!value && /^[A-Za-z0-9-]{1,64}$/.test(value);
}

/** The draft scope of one empty workout's session. */
export function emptyWorkoutDraftScope(sessionId: string): string {
  return SCOPE_PREFIX + sessionId;
}

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
 *  is added later is in the draft, not in its name. */
export function emptyWorkoutDraftIdentity(sessionId: string): string {
  return computeDraftIdentity({
    scope: emptyWorkoutDraftScope(sessionId),
    epoch: EMPTY_WORKOUT_DRAFT_EPOCH,
    dayIndex: EMPTY_WORKOUT_DAY_INDEX,
    dayName: EMPTY_WORKOUT_NAME,
    layout: [],
  });
}

/** The session an empty workout's draft was kept from, or null for any
 *  other draft. */
export function emptyWorkoutDraftSession(
  draft: Pick<WorkoutDraft, "identity">
): string | null {
  const scope = draftIdentityScope(draft.identity);
  if (!scope?.startsWith(SCOPE_PREFIX)) return null;
  const sessionId = scope.slice(SCOPE_PREFIX.length);
  return isEmptyWorkoutSessionId(sessionId) &&
    draft.identity === emptyWorkoutDraftIdentity(sessionId)
    ? sessionId
    : null;
}

/** Where Resume opens an empty workout under way: its page, on its own
 *  session, which carries on without asking again. */
export function emptyWorkoutResumeTarget(sessionId: string): string {
  return `${EMPTY_WORKOUT_PATH}?${EMPTY_WORKOUT_SESSION_PARAM}=${encodeURIComponent(sessionId)}&${RESUME_PARAM}=1`;
}

/** Which writer saves a session of a draft scope: its workout id's
 *  prefix (`liftWorkoutId`). */
export function workoutSourceForScope(
  scope: string | undefined
): "programme" | "routine" | "free" {
  if (scope?.startsWith(SCOPE_PREFIX)) return "free";
  return scope?.startsWith("routine:") ? "routine" : "programme";
}

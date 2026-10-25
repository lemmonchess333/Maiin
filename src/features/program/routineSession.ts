import type { WorkoutDay } from "./programTypes";
import type { SavedRoutine } from "@/lib/savedRoutines";
import { exerciseFromRoutine } from "./routineExercise";
import {
  computeDraftIdentity,
  draftIdentityScope,
  draftLayout,
  type WorkoutDraft,
} from "@/hooks/useWorkoutDraft";

/**
 * A saved routine's workout, as its page runs it and as the screens that
 * offer an unfinished one back recognise its draft.
 *
 * A draft is named by the session's layout (`computeDraftIdentity`), so
 * the page and the readers both build the session from here: a second copy
 * could offer a Resume that opens a fresh session.
 */

/** What a routine's session is built from. */
export type RoutineLayout = Pick<SavedRoutine, "id" | "name" | "exercises">;

/** The day a routine's session runs as. Programme days are 0 to 6, so a
 *  routine's draft never takes a day's place; routines are told apart by
 *  their scope (`routineDraftScope`). */
export const ROUTINE_DAY_INDEX = -1;

/** A routine's drafts have no epoch: an edit to the routine changes the
 *  layout, which the identity already covers. */
export const ROUTINE_DRAFT_EPOCH = 0;

const SCOPE_PREFIX = "routine:";

/** The draft scope of one routine's session: each routine keeps its own. */
export function routineDraftScope(routineId: string): string {
  return SCOPE_PREFIX + routineId;
}

/**
 * The routine a draft was kept from, or null for a programme day's. Only
 * a name a routine's document could have is returned, so a reader can
 * look it up.
 */
export function draftRoutineId(
  draft: Pick<WorkoutDraft, "identity">
): string | null {
  const scope = draftIdentityScope(draft.identity);
  if (!scope?.startsWith(SCOPE_PREFIX)) return null;
  const id = scope.slice(SCOPE_PREFIX.length);
  return id && !id.includes("/") && id !== "." && id !== ".." ? id : null;
}

/** The day the workout screen runs for a routine. */
export function routineSessionDay(
  routine: Pick<RoutineLayout, "name" | "exercises">
): WorkoutDay {
  return {
    dayName: routine.name,
    dayType: "lift",
    exercises: routine.exercises.map(exerciseFromRoutine),
    completed: false,
  };
}

/** The identity the workout screen gives a routine's draft. A routine
 *  renamed, or with an exercise or a set count changed, has another. */
export function routineDraftIdentity(routine: RoutineLayout): string {
  const day = routineSessionDay(routine);
  return computeDraftIdentity({
    scope: routineDraftScope(routine.id),
    epoch: ROUTINE_DRAFT_EPOCH,
    dayIndex: ROUTINE_DAY_INDEX,
    dayName: day.dayName,
    layout: draftLayout(day.exercises),
  });
}

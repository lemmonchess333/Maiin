/**
 * Saved routines (PR 4 — "Save as routine" / copy-this-workout).
 *
 * Lets users save a workout they see in the social feed as a reusable
 * routine on their own profile. Storage is per-user, owner-only:
 *   users/{uid}/savedRoutines/{routineId}
 *
 * Source-of-truth fields are denormalised at save time. If the original
 * activity is later edited or deleted, the saved routine doesn't drift —
 * it's a snapshot, not a pointer.
 *
 * The "run this routine" path lives in src/pages/Routine.tsx (PR 4.1)
 * and reuses the existing WorkoutSession component with a synthetic
 * dayIndex (-1) so saved-routine sessions don't collide with program
 * day drafts.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";

export interface SavedRoutineExercise {
  /** Display name e.g. "Bench Press" — denormalised from the source. */
  name: string;
  /** Maps back into src/lib/exercises for category / icon lookup when
   *  PR 4.1 wires the runnable workout flow. May be missing on very
   *  old activities posted before the structured payload — caller
   *  treats the routine as freeform in that case. */
  exerciseId?: string;
  /** Plain-text recap from the source activity, used for compact
   *  preview rendering on Program.tsx so we don't have to recompute. */
  summary: string;
  setCount: number;
  targetReps: number;
  targetWeightKg: number;
}

export interface SavedRoutine {
  id: string;
  /** User-chosen name (defaults to the source workout name). */
  name: string;
  /** Original activity doc id, kept for "go to source post" links. */
  sourceActivityId: string;
  sourceAuthorId: string;
  sourceAuthorName: string;
  /** Optional — original workout's display name on the activity card. */
  sourceWorkoutName?: string;
  exercises: SavedRoutineExercise[];
  /** Server timestamp; serialized via firestore Timestamp on read. */
  createdAt?: Timestamp;
}

export interface SaveRoutineInput {
  name: string;
  sourceActivityId: string;
  sourceAuthorId: string;
  sourceAuthorName: string;
  sourceWorkoutName?: string;
  exercises: SavedRoutineExercise[];
}

/**
 * Structure-only external saves (ROUTINE-EXCHANGE privacy contract).
 *
 * The locked share contract is "routine blueprint with personal working
 * weights hidden by default": when a member saves ANOTHER member's workout,
 * the copy they receive is the structure (order, sets, reps) — never the
 * source member's working loads. The recipient's own history sets their
 * weights from there, exactly like the curated blueprint library
 * (`blueprintToRoutineInput` blanks `targetWeightKg`). Saving your OWN
 * workout keeps your own loads — they're yours.
 *
 * `isExternalRoutineSource` is the single ownership predicate; redaction is
 * applied BOTH at write time (`saveRoutine`) and at read time
 * (`listSavedRoutines` / `getSavedRoutine`) so routines saved before this
 * shipped are served structure-only too — a read adapter, not a risky
 * background migration.
 */
export function isExternalRoutineSource(
  uid: string,
  sourceAuthorId: string | undefined
): boolean {
  return !!sourceAuthorId && sourceAuthorId !== uid;
}

/** Strip the weight from a summary recap. Summaries with no weight token
 *  pass through untouched (blueprint summaries carry cues — "3×1 (45s
 *  holds)" — that a rebuild would destroy). Weight-bearing structured
 *  entries rebuild as "sets×reps"; legacy freeform summaries ("5×5×100kg")
 *  have the weight token removed. */
function redactedSummary(ex: SavedRoutineExercise): string {
  const summary = ex.summary || "";
  if (!/\d+(?:\.\d+)?\s*kg/i.test(summary)) return summary;
  if (ex.setCount > 0 && ex.targetReps > 0) {
    return `${ex.setCount}×${ex.targetReps}`;
  }
  return summary.replace(/×\d+(?:\.\d+)?\s*kg/gi, "").trim();
}

export function redactExternalRoutineExercises(
  uid: string,
  sourceAuthorId: string | undefined,
  exercises: SavedRoutineExercise[]
): SavedRoutineExercise[] {
  if (!isExternalRoutineSource(uid, sourceAuthorId)) return exercises;
  return exercises.map((ex) => ({
    ...ex,
    summary: redactedSummary(ex),
    targetWeightKg: 0,
  }));
}

export async function saveRoutine(
  uid: string,
  input: SaveRoutineInput
): Promise<string> {
  const ref = await addDocGuarded(
    collection(db, "users", uid, "savedRoutines"),
    {
      name: input.name,
      sourceActivityId: input.sourceActivityId,
      sourceAuthorId: input.sourceAuthorId,
      sourceAuthorName: input.sourceAuthorName,
      ...(input.sourceWorkoutName
        ? { sourceWorkoutName: input.sourceWorkoutName }
        : {}),
      exercises: redactExternalRoutineExercises(
        uid,
        input.sourceAuthorId,
        input.exercises
      ),
      createdAt: serverTimestamp(),
    }
  );
  return ref.id;
}

export async function listSavedRoutines(uid: string): Promise<SavedRoutine[]> {
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "savedRoutines"),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => {
    const data = d.data() as Omit<SavedRoutine, "id">;
    return {
      id: d.id,
      ...data,
      exercises: redactExternalRoutineExercises(
        uid,
        data.sourceAuthorId,
        data.exercises || []
      ),
    };
  });
}

export async function deleteSavedRoutine(
  uid: string,
  routineId: string
): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "savedRoutines", routineId));
}

export async function getSavedRoutine(
  uid: string,
  routineId: string
): Promise<SavedRoutine | null> {
  const snap = await getDoc(doc(db, "users", uid, "savedRoutines", routineId));
  if (!snap.exists()) return null;
  const data = snap.data() as Omit<SavedRoutine, "id">;
  return {
    id: snap.id,
    ...data,
    exercises: redactExternalRoutineExercises(
      uid,
      data.sourceAuthorId,
      data.exercises || []
    ),
  };
}

/**
 * Map an activity's `exercises` array (as written by useProgram) into
 * the SavedRoutineExercise shape. Tolerates two payload shapes:
 *   - PR 4+ payload: structured fields + summary
 *   - Pre-PR 4 payload: just `{ name, summary }` — setCount/reps/weight
 *     fall back to 0 and exerciseId is absent. The routine still saves
 *     and is viewable, but PR 4.1 will surface "freeform" routines
 *     differently from structured ones.
 */
export function activityExercisesToRoutine(
  raw: unknown
): SavedRoutineExercise[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((ex) => {
    const e = ex as {
      name?: string;
      exerciseId?: string;
      summary?: string;
      setCount?: number;
      targetReps?: number;
      targetWeightKg?: number;
    };
    return {
      name: e.name || "Exercise",
      ...(e.exerciseId ? { exerciseId: e.exerciseId } : {}),
      summary: e.summary || "",
      setCount: typeof e.setCount === "number" ? e.setCount : 0,
      targetReps: typeof e.targetReps === "number" ? e.targetReps : 0,
      targetWeightKg:
        typeof e.targetWeightKg === "number" ? e.targetWeightKg : 0,
    };
  });
}

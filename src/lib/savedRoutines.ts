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
  addDoc,
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

export async function saveRoutine(
  uid: string,
  input: SaveRoutineInput,
): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "savedRoutines"), {
    name: input.name,
    sourceActivityId: input.sourceActivityId,
    sourceAuthorId: input.sourceAuthorId,
    sourceAuthorName: input.sourceAuthorName,
    ...(input.sourceWorkoutName ? { sourceWorkoutName: input.sourceWorkoutName } : {}),
    exercises: input.exercises,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listSavedRoutines(uid: string): Promise<SavedRoutine[]> {
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "savedRoutines"),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Omit<SavedRoutine, "id">;
    return { id: d.id, ...data };
  });
}

export async function deleteSavedRoutine(uid: string, routineId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "savedRoutines", routineId));
}

export async function getSavedRoutine(
  uid: string,
  routineId: string,
): Promise<SavedRoutine | null> {
  const snap = await getDoc(doc(db, "users", uid, "savedRoutines", routineId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<SavedRoutine, "id">) };
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
  raw: unknown,
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
      targetWeightKg: typeof e.targetWeightKg === "number" ? e.targetWeightKg : 0,
    };
  });
}

/**
 * The best-lift map, `users/{uid}/stats/prMap`: the best set per exercise
 * and rep bucket, the best single-session volume per exercise, and how many
 * sessions trained each exercise (a best is celebrated only after three).
 *
 * It is a cache. Every figure in it can be rebuilt from the saved workouts,
 * and the workout screen keeps it so a session can tell a new best from the
 * whole history without reading the whole history. This module is the only
 * reader and writer, and keeps the one protocol that makes a cache safe:
 *
 * - `revision` counts writes. A session commits only over the revision it
 *   loaded; if anything changed the map since, the session marks it stale
 *   instead of writing over it.
 * - `invalidated` says the map is stale. The next load rebuilds it from the
 *   whole history, not the recent window.
 * - A correction, and a deleted workout, mark it stale. A best set by a
 *   mis-logged session must not stay the best to beat, and a session
 *   deleted from the history must not stay counted.
 */
import {
  doc,
  getDoc,
  increment,
  runTransaction,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type SetOptions,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  buildPRMap,
  buildVolumeBest,
  bumpSessionCounts,
  nextVolumeBest,
  type PRMap,
  type VolumeBestMap,
} from "./prTracking";
import { fetchSavedWorkouts, type Workout } from "./savedWorkouts";

export interface LiftRecords {
  /** Best set per exercise and rep bucket. */
  map: PRMap;
  /** Sessions that trained each exercise. */
  sessionCounts: Record<string, number>;
  /** Best single-session volume per exercise. */
  volumeBest: VolumeBestMap;
  /** The stored revision this copy was read at. */
  revision: number;
}

/** What a session trained: each exercise's completed working sets. */
export interface SessionLift {
  name: string;
  repUnit?: "reps" | "seconds";
  sets: { weightKg: number; reps: number }[];
}

function recordsRef(uid: string): DocumentReference {
  return doc(db, "users", uid, "stats", "prMap");
}

/**
 * The map as a session starts with it.
 *
 * A stored map wins over a rebuild, because it only ever ratchets: a
 * rebuild from the recent window that misses the person's real best would
 * celebrate a lift worse than one they have already logged. So the window
 * fills in only the pieces a legacy map lacks. A stale map is rebuilt
 * whole, from the whole history.
 *
 * `recent` is the newest saved workouts, which the session has already
 * read to prefill its weights.
 */
export async function loadLiftRecords(
  uid: string,
  recent: readonly Workout[]
): Promise<LiftRecords> {
  let stored: Partial<LiftRecords> & { invalidated?: boolean } = {};
  try {
    const snap = await getDoc(recordsRef(uid));
    if (snap.exists()) stored = snap.data();
  } catch {
    // Rebuilt from history below.
  }
  const revision = stored.revision ?? 0;
  const stale = stored.invalidated === true;
  const kept = stale ? {} : stored;
  if (kept.map && kept.sessionCounts && kept.volumeBest) {
    return {
      map: kept.map,
      sessionCounts: kept.sessionCounts,
      volumeBest: kept.volumeBest,
      revision,
    };
  }

  const history = (
    stale ? await fetchSavedWorkouts(uid, { all: true }) : recent
  ).map(projectForRecords);
  return {
    map: kept.map ?? buildPRMap(history),
    sessionCounts: kept.sessionCounts ?? countSessions(history),
    volumeBest: kept.volumeBest ?? buildVolumeBest(history),
    revision,
  };
}

/**
 * A saved workout as the rebuild reads it. One projection for every piece:
 * each set keeps its type and each exercise its unit, because the rules
 * that read them (no warm-ups, no holds) are unreachable on a copy that
 * dropped them.
 */
function projectForRecords(workout: Workout) {
  return {
    date: workout.date,
    exercises: workout.exercises.map((ex) => ({
      exerciseName: ex.exerciseName,
      repUnit: ex.repUnit,
      sets: (ex.sets ?? []).map((set) => ({
        weightKg: set.weightKg || 0,
        reps: set.reps || 0,
        type: set.type,
      })),
    })),
  };
}

/** Sessions per exercise, each session counted once. */
function countSessions(
  history: ReturnType<typeof projectForRecords>[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const workout of history) {
    for (const name of new Set(workout.exercises.map((e) => e.exerciseName)))
      counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/**
 * Save what a finished session leaves the map as: its live best-set map,
 * and the volume bests and session counts its completed working sets add
 * to the ones it loaded. Written only over the revision the session
 * loaded. When anything changed the map since (another session, a
 * correction, a delete), it is marked stale instead, and the next session
 * rebuilds it from the whole history.
 */
export async function commitLiftRecords(
  uid: string,
  loaded: Pick<LiftRecords, "sessionCounts" | "volumeBest" | "revision">,
  session: { map: PRMap; lifts: readonly SessionLift[]; date: string }
): Promise<"saved" | "invalidated"> {
  const { auth } = await import("./firebase");
  const ref = recordsRef(uid);
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);
    if (auth.currentUser?.uid !== uid)
      throw new Error("Sign in again to save your records.");
    const revision = current.data()?.revision ?? 0;
    if (revision !== loaded.revision) {
      transaction.set(
        ref,
        { invalidated: true, revision: revision + 1 },
        { merge: true }
      );
      return "invalidated";
    }
    transaction.set(
      ref,
      {
        map: session.map,
        sessionCounts: bumpSessionCounts(
          loaded.sessionCounts,
          session.lifts
            .filter((lift) => lift.name && lift.sets.length > 0)
            .map((lift) => lift.name)
        ),
        volumeBest: nextVolumeBest(
          loaded.volumeBest,
          [...session.lifts],
          session.date
        ),
        updatedAt: Timestamp.now(),
        invalidated: false,
        revision: revision + 1,
      },
      { merge: true }
    );
    return "saved";
  });
}

/**
 * Mark the map stale in the same commit as the change that made it so: a
 * corrected workout (a transaction) or a deleted one (a batch). Bumping the
 * revision also stops a session that loaded the old map from writing it
 * back.
 */
export function invalidateLiftRecords(
  writer: {
    set(
      ref: DocumentReference,
      data: DocumentData,
      options: SetOptions
    ): unknown;
  },
  uid: string
): void {
  writer.set(
    recordsRef(uid),
    { invalidated: true, revision: increment(1) },
    { merge: true }
  );
}

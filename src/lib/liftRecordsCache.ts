/** Cache invalidation lives apart from its history reader so durable workout
 * replay can mark records stale without depending back on the offline queue. */
import {
  doc,
  increment,
  type DocumentData,
  type DocumentReference,
  type SetOptions,
} from "firebase/firestore";
import { db } from "./firebase";
import { setDocGuarded } from "./firestoreWrite";

export function liftRecordsRef(uid: string): DocumentReference {
  return doc(db, "users", uid, "stats", "prMap");
}

/**
 * Mark the map stale on its own, for a session whose workout saved but
 * whose records did not. Left as it was, the map is complete and at the
 * revision the next session loads, so that session would build on it
 * without this one's sets, for good. Stale, it is rebuilt from the whole
 * history, which holds the saved workout.
 */
export function markLiftRecordsStale(uid: string): Promise<void> {
  return setDocGuarded(
    liftRecordsRef(uid),
    { invalidated: true, revision: increment(1) },
    { merge: true }
  );
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
    liftRecordsRef(uid),
    { invalidated: true, revision: increment(1) },
    { merge: true }
  );
}

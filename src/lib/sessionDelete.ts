import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Deleting one logged session — the client half of ADR-0012.
 *
 * The server half (`onWorkoutDeleted` / `onRunDeleted`) is what makes this
 * safe to offer at all. Before it existed, deleting a session fired
 * nothing: challenge standing and lifetime totals kept the deleted
 * session's contribution forever, so `useWorkouts.deleteWorkout` was
 * written and deliberately wired to nothing, and runs had no delete path
 * at all. Do not call this from a build where those triggers are not
 * deployed — the damage would be silent, and the user has been told the
 * record is gone.
 *
 * What the user gets back, per ADR-0012: challenge progress and lifetime
 * totals are reversed by the trigger; the Performance Index recovers on
 * its next recompute; partner streaks, milestone badges and
 * `fastest_effort` bests stay. The confirmation copy says so rather than
 * implying a clean undo.
 *
 * `deleteDoc` is raw on purpose. The `firestoreWrite` guards exist to
 * strip `undefined` (which Firestore rejects) and to survive offline-queue
 * replay — a delete carries no payload to strip, and there is no
 * delete-shaped guard to route through.
 */

export type SessionKind = "workout" | "run";

const COLLECTION: Record<SessionKind, string> = {
  workout: "workouts",
  run: "runs",
};

/**
 * A shared feed post is a SEPARATE document, not a view of the session, so
 * deleting the session would otherwise strand a public claim about a
 * session that no longer exists — and nothing in the app can delete a post
 * on its own, so the user would have no way to clear it.
 *
 * Only workouts carry the link. `WorkoutFeedShareSheet` writes
 * `sharedActivityId` back onto the workout; the run share path
 * (`ShareComposerSheet` → `postActivity`) records nothing on the run, so a
 * shared run's post cannot be found from the run. The copy for runs says
 * the post stays rather than pretending otherwise; closing that asymmetry
 * means writing the marker on the run side first.
 */
export async function deleteLoggedSession({
  uid,
  kind,
  id,
  sharedActivityId,
}: {
  uid: string;
  kind: SessionKind;
  id: string;
  sharedActivityId?: string | null;
}): Promise<void> {
  // Post FIRST, session second. The reverse order strands the post if the
  // second delete fails — and the post is the half the user cannot clear
  // by retrying, because the session it was reachable from is already
  // gone. This way a partial failure leaves the session in place and a
  // retry is a plain repeat (deleting an already-deleted doc succeeds).
  if (sharedActivityId) {
    await deleteDoc(doc(db, "activities", sharedActivityId));
  }
  await deleteDoc(doc(db, "users", uid, COLLECTION[kind], id));
}

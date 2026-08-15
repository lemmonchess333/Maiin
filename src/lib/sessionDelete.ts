import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";

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
 * Every share path records the link via `recordSharedActivity` below —
 * the save-time composers (programme, routine, run), `/workout/:id`'s
 * share sheet, and the offline drain, which carries a `ShareSource` on
 * the queued item for exactly this. Sessions shared before the run-side
 * and drain-side markers existed have no link, and the confirmation copy
 * says their post stays rather than pretending otherwise.
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

/** Where a feed post came from — carried on queued shares so the drain
 *  can record the link after posting. */
export interface ShareSource {
  kind: SessionKind;
  id: string;
}

/**
 * Record a posted activity's id back onto its source session.
 *
 * This link is the ONLY thing that lets `deleteLoggedSession` clear the
 * feed post when the session is deleted — without it the post is
 * stranded: a public claim about a session that no longer exists, which
 * nothing in the app can remove. It also dedupes: `/workout/:id` reads it
 * to show "Shared to your feed" instead of offering a second post.
 *
 * One helper instead of a copy per share surface, because it had already
 * started drifting: the two workout save-composers wrote it inline, the
 * share sheet wrote a third copy, and the run path and the offline drain
 * wrote nothing — so a shared run, or ANY session shared offline,
 * stranded its post on delete.
 *
 * Best-effort by contract: a failed marker costs a possible duplicate
 * post (and a stranded one if the session is later deleted) — never the
 * post itself, and never the save. Every caller relied on that, so the
 * swallow lives here rather than being re-implemented at each site.
 */
export async function recordSharedActivity(
  uid: string,
  source: ShareSource,
  activityId: string
): Promise<void> {
  try {
    await updateDocGuarded(
      doc(db, "users", uid, COLLECTION[source.kind], source.id),
      { sharedActivityId: activityId }
    );
  } catch (err) {
    logger.warn("[sessionDelete] shared marker write failed:", err);
  }
}

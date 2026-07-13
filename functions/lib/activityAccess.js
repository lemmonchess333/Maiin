"use strict";

/**
 * Server-side activity-visibility gate for child interactions (packet 13).
 *
 * Kudos, comments, and comment reactions must obey the SAME access boundary
 * as the parent activity. Firestore Rules enforce this for parent reads, but
 * the counter/comment/reaction callables bypass rules and previously checked
 * only that the parent EXISTS — so a former follower or a stranger holding an
 * activity ID could still interact with (and generate notifications for)
 * content they can no longer view.
 *
 * The parent MUST be read inside the caller's transaction: a pre-transaction
 * read opens a follow/unfollow race between the visibility check and the
 * mutation.
 */

function notAccessible() {
  const error = new Error("activity-not-accessible");
  error.code = "activity-not-accessible";
  return error;
}

/**
 * Read the parent activity inside `tx` and require the same visibility
 * relation Firestore Rules use (public, owner, or accepted follower).
 * Returns the activity data on success; throws `activity-not-accessible`
 * (stable code) otherwise — the callers map that to a generic
 * permission-denied so the response never discloses existence/visibility.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Transaction} args.tx
 * @param {FirebaseFirestore.Firestore} args.firestore
 * @param {FirebaseFirestore.DocumentReference} args.activityRef
 * @param {string} args.uid
 */
async function assertCanInteractWithActivity({ tx, firestore, activityRef, uid }) {
  const activitySnap = await tx.get(activityRef);
  if (!activitySnap.exists) throw notAccessible();

  const activity = activitySnap.data() || {};
  if (activity.authorId === uid || activity.visibility === "public") {
    return activity;
  }

  if (
    activity.visibility !== "followers" ||
    typeof activity.authorId !== "string" ||
    activity.authorId.length === 0
  ) {
    throw notAccessible();
  }

  const followerRef = firestore
    .collection("followers")
    .doc(activity.authorId)
    .collection("users")
    .doc(uid);

  const followerSnap = await tx.get(followerRef);
  if (!followerSnap.exists) throw notAccessible();

  return activity;
}

module.exports = { assertCanInteractWithActivity };

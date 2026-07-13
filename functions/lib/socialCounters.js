/**
 * 2026-05-26 audit PR 2 — counter mutations via Cloud Functions.
 *
 * Closes findings #2 (activity counters forgeable) + #5 (crew
 * memberCount forgeable). Pre-PR-2, Firestore rules used
 * `affectedKeys().hasOnly([...])` which restricts WHICH fields
 * change but NOT the values. Any authed user could write
 * `{ kudosCount: 999999 }` directly.
 *
 * Post-PR-2:
 *   - `kudosCount` / `commentCount` / `memberCount` are denied
 *     from direct client writes at the rules layer.
 *   - These helpers run server-side (via the callable CFs in
 *     `index.js`) and mutate counters atomically via Firestore
 *     transactions tied to the underlying kudos / comment / member
 *     doc existence.
 *
 * Atomicity invariant pinned by tests: counter delta + member doc
 * existence are flipped in the SAME transaction. A double-tap
 * race can't double-count (the txn re-runs on contention).
 *
 * Logger + admin handles are injected so unit tests can drive the
 * helpers with stubs (mirrors the `checkoutTrial.js` /
 * `subscriptionReconciliation.js` pattern from prior PRs).
 */

const {
  assertCanInteractWithActivity,
} = require("./activityAccess");

/**
 * Toggle kudos: if the kudos sub-doc exists for {uid} on
 * {activityId}, delete it + decrement the activity's kudosCount.
 * Otherwise create it + increment. Returns the new state.
 *
 * Args:
 *   - firestore: admin.firestore() handle
 *   - uid:       authenticated caller's uid
 *   - activityId: target activity
 *   - increment(n): factory for Firestore increment sentinel
 *                  (admin.firestore.FieldValue.increment in prod)
 *   - serverTimestamp(): factory for serverTimestamp sentinel
 *                  (admin.firestore.FieldValue.serverTimestamp in prod)
 *
 * Returns: { kudosed: boolean } — true if the call just added kudos,
 *   false if it removed them. Idempotent under re-tap (the next call
 *   will flip back).
 */
async function toggleKudos({
  firestore,
  uid,
  activityId,
  increment,
  serverTimestamp,
}) {
  if (!firestore || !uid || !activityId) {
    throw new Error("toggleKudos: firestore, uid, activityId required");
  }
  const activityRef = firestore.collection("activities").doc(activityId);
  const kudosRef = firestore
    .collection("kudos")
    .doc(activityId)
    .collection("users")
    .doc(uid);

  return firestore.runTransaction(async (txn) => {
    // Enforce the parent activity's visibility (public / owner / accepted
    // follower) INSIDE the txn — a former follower or stranger must not kudos
    // content they can no longer view. Also covers the non-existent-activity
    // integrity case (throws activity-not-accessible).
    const activity = await assertCanInteractWithActivity({
      tx: txn,
      firestore,
      activityRef,
      uid,
    });

    const kudosSnap = await txn.get(kudosRef);
    if (kudosSnap.exists) {
      txn.delete(kudosRef);
      txn.update(activityRef, { kudosCount: increment(-1) });
      return { kudosed: false, activityAuthorId: activity.authorId };
    }
    txn.set(kudosRef, { createdAt: serverTimestamp() });
    txn.update(activityRef, { kudosCount: increment(1) });
    return { kudosed: true, activityAuthorId: activity.authorId };
  });
}

/**
 * Add a comment to an activity. Creates the comment sub-doc and
 * increments commentCount atomically.
 *
 * Args:
 *   - firestore, uid, activityId — as above
 *   - text:        comment body (1-1000 chars, validated)
 *   - authorName:  denormalised display name on the comment doc
 *   - authorPhotoURL: optional avatar
 *   - increment, serverTimestamp — sentinel factories
 *
 * Returns: { commentId } — the generated comment doc id.
 *
 * Validation:
 *   - text trimmed length 1..1000
 *   - authorName length 1..100
 *
 * Caller (the CF wrapper in index.js) translates throw → HttpsError.
 */
async function addComment({
  firestore,
  uid,
  activityId,
  text,
  authorName,
  authorPhotoURL,
  increment,
  serverTimestamp,
}) {
  if (!firestore || !uid || !activityId) {
    throw new Error("addComment: firestore, uid, activityId required");
  }
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new Error("addComment: text must be 1-1000 chars");
  }
  const name =
    typeof authorName === "string" && authorName.trim().length > 0
      ? authorName.trim().slice(0, 100)
      : "Athlete";

  const activityRef = firestore.collection("activities").doc(activityId);
  const commentsRef = firestore
    .collection("comments")
    .doc(activityId)
    .collection("items");

  // commentsRef.doc() generates a new ID client-side-style; we use
  // it inside the txn so the same ID applies to both writes.
  const commentRef = commentsRef.doc();

  let activityAuthorId;
  await firestore.runTransaction(async (txn) => {
    // Same visibility gate as kudos — a stranger/former-follower must not be
    // able to comment on (and notify the author of) content they can't view.
    const activity = await assertCanInteractWithActivity({
      tx: txn,
      firestore,
      activityRef,
      uid,
    });
    activityAuthorId = activity.authorId;
    const data = {
      authorId: uid,
      authorName: name,
      text: trimmed,
      createdAt: serverTimestamp(),
    };
    if (authorPhotoURL && typeof authorPhotoURL === "string") {
      data.authorPhotoURL = authorPhotoURL.slice(0, 500);
    }
    txn.set(commentRef, data);
    txn.update(activityRef, { commentCount: increment(1) });
  });

  return { commentId: commentRef.id, activityAuthorId };
}

/**
 * Delete a comment. Caller must be the comment author. Atomically
 * removes the doc and decrements commentCount.
 */
async function deleteComment({
  firestore,
  uid,
  activityId,
  commentId,
  increment,
}) {
  if (!firestore || !uid || !activityId || !commentId) {
    throw new Error(
      "deleteComment: firestore, uid, activityId, commentId required",
    );
  }
  const activityRef = firestore.collection("activities").doc(activityId);
  const commentRef = firestore
    .collection("comments")
    .doc(activityId)
    .collection("items")
    .doc(commentId);

  await firestore.runTransaction(async (txn) => {
    // deleteComment is also an interaction with the parent. A former follower
    // otherwise keeps a callable path to delete their old comment (and
    // decrement the counter) on an activity they can no longer see. Gate on
    // parent access FIRST — all reads before any write.
    await assertCanInteractWithActivity({
      tx: txn,
      firestore,
      activityRef,
      uid,
    });

    const commentSnap = await txn.get(commentRef);
    if (!commentSnap.exists) {
      throw new Error(`deleteComment: comment ${commentId} not found`);
    }
    const data = commentSnap.data();
    if (!data || data.authorId !== uid) {
      throw new Error("deleteComment: not authorized");
    }
    txn.delete(commentRef);
    txn.update(activityRef, { commentCount: increment(-1) });
  });
}

/**
 * Join or leave a crew. Atomically writes the membership doc and
 * adjusts memberCount.
 *
 * Args:
 *   - action: "join" | "leave"
 *   - displayName: denormalised display name on the member doc (join only)
 */
async function setCrewMembership({
  firestore,
  uid,
  crewId,
  action,
  displayName,
  increment,
  serverTimestamp,
}) {
  if (!firestore || !uid || !crewId) {
    throw new Error("setCrewMembership: firestore, uid, crewId required");
  }
  if (action !== "join" && action !== "leave") {
    throw new Error("setCrewMembership: action must be 'join' or 'leave'");
  }
  const crewRef = firestore.collection("groups").doc(crewId);
  const memberRef = crewRef.collection("members").doc(uid);

  await firestore.runTransaction(async (txn) => {
    const crewSnap = await txn.get(crewRef);
    if (!crewSnap.exists) {
      throw new Error(`setCrewMembership: crew ${crewId} not found`);
    }
    const memberSnap = await txn.get(memberRef);
    if (action === "join") {
      // Idempotent — already a member is a no-op. Counter stays
      // accurate (the FIRST join was the one that incremented).
      if (memberSnap.exists) return;
      const name =
        typeof displayName === "string" && displayName.trim().length > 0
          ? displayName.trim().slice(0, 100)
          : "Athlete";
      txn.set(memberRef, {
        joinedAt: serverTimestamp(),
        displayName: name,
      });
      txn.update(crewRef, { memberCount: increment(1) });
    } else {
      // leave: idempotent — already absent is a no-op.
      if (!memberSnap.exists) return;
      txn.delete(memberRef);
      txn.update(crewRef, { memberCount: increment(-1) });
    }
  });
}

module.exports = {
  toggleKudos,
  addComment,
  deleteComment,
  setCrewMembership,
};

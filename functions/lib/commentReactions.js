/**
 * Comment reactions (social features pass, 2026-07) — one-tap 💪 / 🔥 on
 * activity comments.
 *
 * Firestore I/O extracted from index.js per the house pattern (pure/injected
 * lib + thin callable orchestration) so the toggle is unit-testable with a
 * firestore stub. Comments are SERVER-WRITE-ONLY (rules: create/delete
 * `if false`), so reactions go through a callable like kudos/comments do.
 *
 * Data shape on the comment doc (comments/{activityId}/items/{commentId}):
 *   reactions: { muscle: [uid...], fire: [uid...] }
 * Uid arrays (not counters) so the toggle is idempotent per user and the
 * client can render own-state without a second read. Runs in a transaction —
 * two users reacting at once must not lose each other's toggle.
 */

const {
  assertCanInteractWithActivity,
} = require("./activityAccess");

const REACTION_KEYS = ["muscle", "fire"];

/**
 * Toggle `uid`'s reaction on a comment. Returns { reacted, count } for the
 * caller's optimistic-UI reconciliation.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.firestore
 * @param {string} args.uid
 * @param {string} args.activityId
 * @param {string} args.commentId
 * @param {string} args.reaction - one of REACTION_KEYS
 */
async function toggleCommentReaction({
  firestore,
  uid,
  activityId,
  commentId,
  reaction,
}) {
  if (!REACTION_KEYS.includes(reaction)) {
    throw new Error("invalid-reaction");
  }
  const activityRef = firestore.collection("activities").doc(activityId);
  const ref = firestore
    .collection("comments")
    .doc(activityId)
    .collection("items")
    .doc(commentId);

  return firestore.runTransaction(async (tx) => {
    // Reacting is an interaction with the parent activity — enforce its
    // visibility before touching the comment (all reads before writes).
    await assertCanInteractWithActivity({
      tx,
      firestore,
      activityRef,
      uid,
    });

    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("comment-not-found");
    const data = snap.data() || {};
    const current =
      data.reactions && Array.isArray(data.reactions[reaction])
        ? data.reactions[reaction]
        : [];
    const has = current.includes(uid);
    const next = has ? current.filter((u) => u !== uid) : [...current, uid];
    // merge:true + nested map so the OTHER reaction key is preserved.
    tx.set(ref, { reactions: { [reaction]: next } }, { merge: true });
    return { reacted: !has, count: next.length };
  });
}

module.exports = { toggleCommentReaction, REACTION_KEYS };

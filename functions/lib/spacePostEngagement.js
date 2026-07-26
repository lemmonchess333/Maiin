/**
 * Space-post engagement (SOC-P2c) — the server-owned like ("props")
 * toggle for Community Space posts, closing the loop the weekly Coach
 * prompts open: an answered prompt can now be backed by the room.
 *
 * Mirrors the activity-kudos lockdown (socialCounters.toggleKudos):
 * likeCount on the post is SERVER-OWNED (rules deny any client diff
 * touching it — the 2026-05-26 counter-forgery lesson), so the like
 * sub-doc and the counter flip in ONE transaction here, and the client
 * goes through the callable in index.js.
 *
 * Layout: spaces/{spaceId}/posts/{postId}/likes/{uid}
 *   — doc id IS the liker uid, so the toggle is naturally idempotent
 *     per user and a retry can't double-count.
 *
 * Visibility note: space posts are readable by ANY signed-in user
 * (rules), so liking deliberately does NOT require space membership —
 * membership gates POSTING, not encouragement. The register is
 * support; the cheapest social act should have the fewest gates.
 */

/** Thrown-code the callable maps to a generic permission error —
 *  never disclose whether a post exists vs was removed. */
const POST_NOT_ACCESSIBLE = "space-post-not-accessible";

async function toggleSpacePostLike({
  firestore,
  uid,
  spaceId,
  postId,
  increment,
  serverTimestamp,
}) {
  if (!firestore || !uid || !spaceId || !postId) {
    throw new Error(
      "toggleSpacePostLike: firestore, uid, spaceId, postId required"
    );
  }
  const postRef = firestore
    .collection("spaces")
    .doc(spaceId)
    .collection("posts")
    .doc(postId);
  const likeRef = postRef.collection("likes").doc(uid);

  return firestore.runTransaction(async (txn) => {
    const postSnap = await txn.get(postRef);
    if (!postSnap.exists) {
      const err = new Error("Post unavailable.");
      err.code = POST_NOT_ACCESSIBLE;
      throw err;
    }
    const likeSnap = await txn.get(likeRef);
    if (likeSnap.exists) {
      txn.delete(likeRef);
      txn.update(postRef, { likeCount: increment(-1) });
      return { liked: false, postAuthorId: postSnap.data().authorId };
    }
    txn.set(likeRef, { createdAt: serverTimestamp() });
    txn.update(postRef, { likeCount: increment(1) });
    return { liked: true, postAuthorId: postSnap.data().authorId };
  });
}

module.exports = { toggleSpacePostLike, POST_NOT_ACCESSIBLE };

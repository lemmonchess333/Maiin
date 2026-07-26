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

/**
 * Add a comment to a Space post (SOC-P2g) — the socialCounters.addComment
 * discipline: comment doc + server-owned commentCount in ONE transaction.
 * No visibility gate beyond post-exists — space posts are readable by any
 * signed-in user, so commenting matches the read surface (the same
 * posture as likes: membership gates POSTING, not engagement).
 */
async function addSpacePostComment({
  firestore,
  uid,
  spaceId,
  postId,
  text,
  authorName,
  authorPhotoURL,
  increment,
  serverTimestamp,
}) {
  if (!firestore || !uid || !spaceId || !postId) {
    throw new Error(
      "addSpacePostComment: firestore, uid, spaceId, postId required"
    );
  }
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new Error("addSpacePostComment: text must be 1-1000 chars");
  }
  const name =
    typeof authorName === "string" && authorName.trim().length > 0
      ? authorName.trim().slice(0, 100)
      : "Athlete";

  const postRef = firestore
    .collection("spaces")
    .doc(spaceId)
    .collection("posts")
    .doc(postId);
  const commentRef = postRef.collection("comments").doc();

  let postAuthorId;
  await firestore.runTransaction(async (txn) => {
    const postSnap = await txn.get(postRef);
    if (!postSnap.exists) {
      const err = new Error("Post unavailable.");
      err.code = POST_NOT_ACCESSIBLE;
      throw err;
    }
    postAuthorId = postSnap.data().authorId;
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
    txn.update(postRef, { commentCount: increment(1) });
  });

  return { commentId: commentRef.id, postAuthorId };
}

/**
 * Delete a Space-post comment — author-only (moderation takedowns go
 * through the report path, exactly like activity comments). Doc delete
 * + commentCount decrement in one transaction; all reads before writes.
 */
async function deleteSpacePostComment({
  firestore,
  uid,
  spaceId,
  postId,
  commentId,
  increment,
}) {
  if (!firestore || !uid || !spaceId || !postId || !commentId) {
    throw new Error(
      "deleteSpacePostComment: firestore, uid, spaceId, postId, commentId required"
    );
  }
  const postRef = firestore
    .collection("spaces")
    .doc(spaceId)
    .collection("posts")
    .doc(postId);
  const commentRef = postRef.collection("comments").doc(commentId);

  await firestore.runTransaction(async (txn) => {
    const postSnap = await txn.get(postRef);
    if (!postSnap.exists) {
      const err = new Error("Post unavailable.");
      err.code = POST_NOT_ACCESSIBLE;
      throw err;
    }
    const commentSnap = await txn.get(commentRef);
    if (!commentSnap.exists) {
      throw new Error(`deleteSpacePostComment: comment ${commentId} not found`);
    }
    const data = commentSnap.data();
    if (!data || data.authorId !== uid) {
      throw new Error("deleteSpacePostComment: not authorized");
    }
    txn.delete(commentRef);
    txn.update(postRef, { commentCount: increment(-1) });
  });
}

module.exports = {
  toggleSpacePostLike,
  addSpacePostComment,
  deleteSpacePostComment,
  POST_NOT_ACCESSIBLE,
};

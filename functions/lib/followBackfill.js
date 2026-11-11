"use strict";
/**
 * Following fills on follow (Soc15, from the 3 November list).
 *
 * The feed is fan-out only: `onActivityCreated` routes a new post to the
 * author's followers at the moment it is made. Someone who follows a
 * person therefore saw nothing of them until that person trained again,
 * and a new account that followed three people looked at an empty
 * Following for days. Strava and Hevy show a followed person's recent
 * sessions at once.
 *
 * So a new follow routes the person's recent shared sessions to the new
 * follower's feed: the last BACKFILL_DAYS days, at most BACKFILL_LIMIT,
 * public or followers-only (a private or auto-flagged post is private and
 * never routed). Each feed row is the same routing index the fan-out
 * writes, under the activity's own id and dated by the activity, so the
 * sessions sit where they happened in the timeline, not on top as new, and
 * a later fan-out of the same post overwrites the same row. Rows that
 * already exist are left alone. The parent activity's rules still decide
 * whether the follower may read it (visibility, a block), as for every
 * feed row.
 *
 * The whole page is written in one transaction that reads both accounts'
 * deletion state, as `writeFeedPage` does, so nothing lands in a feed whose
 * account is being deleted, nor carries an author who is. It reads the
 * author's restriction too: a restricted account reaches no one (S4e), and
 * routing its older posts into a new follower's feed would add to what
 * other people see, as the pulse and the community goal refuse to.
 */
const { buildFeedIndex, FEED_COPY_RETENTION_DAYS } = require("./feedIndex");
const { transactionAccountsLive } = require("./deletionTransactionGuard");

const BACKFILL_DAYS = 30;
const BACKFILL_LIMIT = 10;
const DAY_MS = 86_400_000;

function millisOf(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

/**
 * Routes `authorUid`'s recent shared sessions to `followerUid`'s feed.
 * Returns `{ written }`, the rows added (0 when there was nothing to add,
 * or either account is being deleted).
 */
async function backfillFollowedPosts({
  firestore,
  followerUid,
  authorUid,
  now = Date.now(),
}) {
  if (!firestore || !followerUid || !authorUid || followerUid === authorUid) {
    return { written: 0 };
  }
  const cutoff = new Date(now - BACKFILL_DAYS * DAY_MS);
  const recent = await firestore
    .collection("activities")
    .where("authorId", "==", authorUid)
    .where("visibility", "in", ["public", "followers"])
    .where("createdAt", ">=", cutoff)
    .orderBy("createdAt", "desc")
    .limit(BACKFILL_LIMIT)
    .get();
  const posts = recent.docs
    .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
    .filter(({ data }) => millisOf(data.createdAt) !== null);
  if (posts.length === 0) return { written: 0 };

  const rows = firestore
    .collection("feeds")
    .doc(followerUid)
    .collection("items");
  const restricted = firestore
    .collection("globalRestrictedUids")
    .doc(authorUid);
  return firestore.runTransaction(async (tx) => {
    const [live, authorRestricted] = await Promise.all([
      transactionAccountsLive({
        firestore,
        tx,
        uids: [authorUid, followerUid],
      }),
      tx.get(restricted),
    ]);
    if (!live || authorRestricted.exists) return { written: 0 };
    const existing = await Promise.all(
      posts.map(({ id }) => tx.get(rows.doc(id)))
    );
    let written = 0;
    posts.forEach(({ id, data }, i) => {
      if (existing[i].exists) return;
      const createdAtMs = millisOf(data.createdAt);
      tx.set(
        rows.doc(id),
        buildFeedIndex({
          activityId: id,
          authorId: authorUid,
          createdAt: data.createdAt,
          expiresAt: new Date(createdAtMs + FEED_COPY_RETENTION_DAYS * DAY_MS),
        })
      );
      written += 1;
    });
    return { written };
  });
}

module.exports = { backfillFollowedPosts, BACKFILL_DAYS, BACKFILL_LIMIT };

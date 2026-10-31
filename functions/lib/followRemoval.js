"use strict";
/**
 * Remove follower (Mob2 call 7): the person followed takes back a follow
 * they accepted, or one made before they approved followers.
 *
 * A follow is two edges, `followers/{uid}/users/{follower}` and
 * `following/{follower}/users/{uid}`. The rules let the follower delete
 * both (unfollowing), and the person followed only across a block, so the
 * removeFollower callable deletes both here, in one transaction, so neither
 * edge is left without the other. The follower is not told: they find
 * the person's followers-only posts closed to them, as on Strava.
 *
 * Open to a restricted account, as unfollowing and blocking are: it
 * reaches no one, it only narrows who reaches the person.
 */

/** Deletes both edges of `followerUid`'s follow of `uid`. True when there
 *  was a follow to remove; false (and nothing written) when there was
 *  none, so a second tap or a retry changes nothing. */
async function removeFollower(db, uid, followerUid) {
  const followerRef = db.doc(`followers/${uid}/users/${followerUid}`);
  const followingRef = db.doc(`following/${followerUid}/users/${uid}`);
  return db.runTransaction(async (tx) => {
    const [follower, following] = await Promise.all([
      tx.get(followerRef),
      tx.get(followingRef),
    ]);
    if (!follower.exists && !following.exists) return false;
    if (follower.exists) tx.delete(followerRef);
    if (following.exists) tx.delete(followingRef);
    return true;
  });
}

module.exports = { removeFollower };

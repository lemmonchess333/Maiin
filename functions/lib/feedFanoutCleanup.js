/**
 * Erasure of a deleted user's fan-out copies from OTHER users' feeds.
 *
 * `socialFanout.fanoutActivityToFeeds` denormalises each activity into
 * every follower's feed at `feeds/{recipient}/items/{activityId}`, and the
 * copy is not a pointer — `buildFeedItem` writes the author's `authorName`,
 * `authorPhotoURL` and a human-readable `summary` of the session into each
 * recipient's tree.
 *
 * The executor deleted neither. It sweeps `feeds/{uid}/items` (the deleted
 * user's OWN feed) and `activities where authorId == uid` (the source docs),
 * so after erasure every follower still held that user's display name, photo
 * URL and workout summary, permanently. `useSocialFeed` renders those items
 * from the feed doc itself — `ActivityCard` guards the stat block on the
 * activity being present but takes the name and summary straight off the feed
 * item — so the deleted user kept appearing in other people's feeds by name.
 *
 * `accountDeletionInventory.json` has always declared this (`feedFanout`,
 * `containsPersonalData: true`, `piiCategory: "userContent"`). Its declared
 * strategy is a `collectionGroup("items")` query filtered through
 * `lib/pathFilterMatcher.js`, which is why that matcher exists. That path is
 * NOT what this module does, deliberately:
 *
 *   - `firestore.indexes.json` declares zero COLLECTION_GROUP indexes, so
 *     the query would throw until an index is added, deployed and built.
 *     Landing the executor half first would be a step that cannot run.
 *   - `collectionGroup("items")` also spans `notifications/*\/items` and any
 *     future `items` collection. The matcher makes that safe, but "safe given
 *     a correct filter" is a worse position for an irreversible delete than
 *     not querying across trees at all.
 *
 * Fan-out doc ids ARE the activity id, so the copies can be addressed
 * directly: recipients × authored activities, every ref built by name. No
 * cross-tree query, no index dependency, and a delete of a doc that was never
 * fanned out is a no-op.
 *
 * KNOWN RESIDUE, stated because the honest bound matters more than a clean
 * claim: recipients are read from `followers/{uid}/users`, and `unfollowUser`
 * deletes only the two edge docs — it does not purge the ex-followee's items
 * from the unfollower's feed. So a copy in the feed of someone who has since
 * unfollowed is not reachable this way and survives. Closing that needs the
 * collection-group sweep the inventory describes, with the index work above.
 * This clears the current-follower set, which is the whole live audience.
 */

"use strict";

/** Firestore's cap is 500 writes per batch; the executor uses 450. */
const BATCH_SIZE = 450;

/**
 * Yield `feeds/{recipient}/items/{activityId}` refs in BATCH_SIZE chunks
 * without materialising the full recipients × activities product.
 *
 * A generator rather than a helper returning an array, because the whole
 * point is that no caller ever holds more than one chunk.
 */
function* crossProductBatches(firestore, recipientIds, activityIds) {
  let slice = [];
  for (const rid of recipientIds) {
    const items = firestore.collection("feeds").doc(rid).collection("items");
    for (const aid of activityIds) {
      slice.push(items.doc(aid));
      if (slice.length === BATCH_SIZE) {
        yield slice;
        slice = [];
      }
    }
  }
  if (slice.length > 0) yield slice;
}

/**
 * Delete every fan-out copy of `uid`'s activities from recipient feeds.
 *
 * MUST run before the executor deletes `followers/{uid}/users` (step 2) and
 * `activities where authorId == uid` (step 3) — both are the inputs. Same
 * ordering constraint as `goalSpaceCleanup`, which reads the journeys index
 * step 1 removes.
 *
 * Never throws. A failure here must not strand a user mid-deletion with their
 * credentials already gone, and the per-batch skip matches the posture the
 * storage sweep and `goalSpaceCleanup` already take.
 *
 * @returns {Promise<{recipients:number, activities:number, deleted:number, failedBatches:number}>}
 */
async function removeFanoutCopiesForUser({ firestore, uid, logger }) {
  const log = logger || { info() {}, warn() {} };
  const result = {
    recipients: 0,
    activities: 0,
    deleted: 0,
    failedBatches: 0,
  };
  if (!firestore || !uid) return result;

  let recipientIds = [];
  let activityIds = [];
  try {
    const [followersSnap, activitiesSnap] = await Promise.all([
      firestore.collection("followers").doc(uid).collection("users").get(),
      firestore.collection("activities").where("authorId", "==", uid).get(),
    ]);
    // The author's own feed is a fan-out recipient too (socialFanout adds it).
    // Step 2 sweeps it anyway; including it here costs nothing and means this
    // module's contract does not depend on that overlap holding.
    recipientIds = Array.from(
      new Set([...followersSnap.docs.map((d) => d.id), uid])
    );
    activityIds = activitiesSnap.docs.map((d) => d.id);
  } catch (err) {
    log.warn("deleteAccount.feed_fanout_read_failed", {
      uid,
      error: err && err.message,
    });
    return result;
  }

  result.recipients = recipientIds.length;
  result.activities = activityIds.length;
  if (activityIds.length === 0 || recipientIds.length === 0) return result;

  // Built one batch at a time rather than as a whole materialised array.
  // The cross product is recipients × activities, so it is the one quantity
  // here that grows multiplicatively: 500 followers × 1,000 activities is
  // half a million DocumentReference objects, comfortably enough to exhaust
  // a 256MB function on a single power user. Only BATCH_SIZE refs are ever
  // live at once now, so peak memory is flat in both dimensions and the
  // sweep is bounded by time rather than heap.
  for (const slice of crossProductBatches(
    firestore,
    recipientIds,
    activityIds
  )) {
    try {
      const batch = firestore.batch();
      slice.forEach((r) => batch.delete(r));
      await batch.commit();
      result.deleted += slice.length;
    } catch (err) {
      // Deleting a doc that does not exist is a no-op, so a failure here is a
      // real Firestore error rather than a missing fan-out copy. Skip the
      // batch and keep going: a partial purge beats aborting the cascade.
      result.failedBatches += 1;
      log.warn("deleteAccount.feed_fanout_batch_failed", {
        uid,
        error: err && err.message,
      });
    }
  }

  log.info("deleteAccount.feed_fanout_swept", {
    uid,
    recipients: result.recipients,
    activities: result.activities,
    deleted: result.deleted,
    failedBatches: result.failedBatches,
  });
  return result;
}

module.exports = { removeFanoutCopiesForUser, crossProductBatches, BATCH_SIZE };

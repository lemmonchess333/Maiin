/**
 * Erasure of a deleted user's challenge participations.
 *
 * `challenges/{challengeId}/participants/{uid}` carries the user's
 * denormalised progress in each challenge they joined, keyed by uid as the
 * doc id. The executor never deleted them: `USER_SUBCOLLECTIONS` covers the
 * user's own tree and `TOP_LEVEL_USER_KEYED_COLLECTIONS` covers collections
 * keyed by uid at the TOP level, and this is neither — it is a uid-keyed doc
 * nested under someone else's parent.
 *
 * WHY NOT THE STRATEGY THE INVENTORY DECLARED. `challengeParticipations` was
 * specified as `collectionGroup("participants").where(documentId(), "==",
 * uid)`. That is not a query Firestore will accept:
 *
 *     Invalid query. When querying a collection group by documentId(), the
 *     value provided must result in a valid document path, but 'target-uid'
 *     is not because it has an odd number of segments (1).
 *
 * A collection-group documentId comparison needs a FULL path, which is
 * precisely what you lack when the question is "where does this uid appear".
 * Four other entries declare the same impossible shape; see
 * `firestore.collectionGroup.test.ts`, which now pins the rejection.
 *
 * WHY THIS ONE IS REACHABLE ANYWAY, and its siblings are not. `challenges` is
 * a bounded top-level collection — `rolloverChallenges` mints a fixed handful
 * per period (weekly, monthly, global-monthly, seasonal, fastest-5k,
 * group-goal), so it grows by roughly a hundred docs a year. Enumerating the
 * parents and addressing `participants/{uid}` by known ref costs one small
 * listing and needs no query. `kudos/{activityId}` and `blocks/{otherUid}`
 * have no such bound — their parents are every activity in the app and every
 * user who blocked you — so the same trick does not transfer.
 *
 * The parent listing uses `.select()`: only doc ids are needed, so no field
 * data is transferred and the cost stays flat as challenge docs gain fields.
 *
 * participantCount is deliberately NOT adjusted here. Deleting a participant
 * doc fires `onChallengeParticipantDeleted`, which recomputes the count from
 * an aggregate query under an observation-time guard — strictly better than
 * the decrement the inventory asked for, which would drift on any redelivery.
 */

"use strict";

/** Firestore's cap is 500 writes per batch; the executor uses 450. */
const BATCH_SIZE = 450;

/**
 * Delete `challenges/{*}/participants/{uid}` for every challenge.
 *
 * Order-independent: it reads the `challenges` collection, which the executor
 * never touches, so it can run anywhere in the cascade before the auth user
 * is deleted.
 *
 * Never throws. A failure here must not strand a user mid-deletion with their
 * credentials already gone — the same posture as the storage sweep and
 * `goalSpaceCleanup`.
 *
 * @returns {Promise<{challenges:number, deleted:number, failedBatches:number}>}
 */
async function removeChallengeParticipationsForUser({
  firestore,
  uid,
  logger,
}) {
  const log = logger || { info() {}, warn() {} };
  const result = { challenges: 0, deleted: 0, failedBatches: 0 };
  if (!firestore || !uid) return result;

  let challengeIds = [];
  try {
    const col = firestore.collection("challenges");
    // `.select()` with no arguments asks for doc refs only. Guarded because
    // the executor's unit stubs model plain collections; falling back to a
    // full get keeps the module testable without a bespoke select() stub.
    const snap = await (typeof col.select === "function"
      ? col.select().get()
      : col.get());
    challengeIds = snap.docs.map((d) => d.id);
  } catch (err) {
    log.warn("deleteAccount.challenge_participations_read_failed", {
      uid,
      error: err && err.message,
    });
    return result;
  }

  result.challenges = challengeIds.length;
  if (challengeIds.length === 0) return result;

  for (let i = 0; i < challengeIds.length; i += BATCH_SIZE) {
    const slice = challengeIds.slice(i, i + BATCH_SIZE);
    try {
      const batch = firestore.batch();
      for (const cid of slice) {
        batch.delete(
          firestore
            .collection("challenges")
            .doc(cid)
            .collection("participants")
            .doc(uid)
        );
      }
      await batch.commit();
      result.deleted += slice.length;
    } catch (err) {
      // Deleting a doc that does not exist is a no-op, so most of these
      // writes are expected to hit nothing — a failure here is a real
      // Firestore error. Skip the batch and continue: a partial purge beats
      // aborting the cascade.
      result.failedBatches += 1;
      log.warn("deleteAccount.challenge_participations_batch_failed", {
        uid,
        error: err && err.message,
      });
    }
  }

  log.info("deleteAccount.challenge_participations_swept", {
    uid,
    challenges: result.challenges,
    deleted: result.deleted,
    failedBatches: result.failedBatches,
  });
  return result;
}

module.exports = { removeChallengeParticipationsForUser, BATCH_SIZE };

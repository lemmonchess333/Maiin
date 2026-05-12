/**
 * Webhook idempotency primitives — extracted so the dedup contract
 * used by both stripeWebhook (functions/index.js) and
 * appleIAPWebhook (functions/appleIAP.js) is testable against the
 * Firestore emulator. The contract:
 *
 *   1. The provider gives every delivery a stable ID (Stripe:
 *      `event.id`, Apple: `notificationUUID`). Either one
 *      uniquely identifies a single logical delivery; retries
 *      reuse the same ID.
 *   2. We claim the ID by reading the dedup doc. If it exists,
 *      this is a retry — return `duplicate: true` so the caller
 *      can ack the webhook (200 OK) and stop the provider's
 *      retry loop without re-running the handler.
 *   3. After the handler succeeds, we finalise the claim by
 *      writing the dedup doc with processing metadata. Next
 *      retry sees the doc and short-circuits.
 *
 * No transaction is used because the check + write straddle the
 * webhook handler's work. A racing duplicate delivery during the
 * window between `checkClaim` and `finaliseClaim` would re-run
 * the handler — but the handlers themselves are idempotent on
 * retry (Stripe's per-event branches all read-modify-write user
 * docs by uid, Apple's branches likewise), so the duplicate
 * processing is safe even though not strictly serialised. The
 * dedup is a perf + cost optimisation, not a correctness
 * boundary.
 */

/**
 * Check whether a delivery has already been processed.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} collection  e.g. "stripeEvents" or "appleNotifications"
 * @param {string} id          Provider's stable delivery ID
 * @returns {Promise<{duplicate: boolean}>}
 */
async function checkClaim(db, collection, id) {
  if (!id) return { duplicate: false };
  try {
    const snap = await db.collection(collection).doc(id).get();
    return { duplicate: snap.exists };
  } catch (err) {
    console.error(`webhookIdempotency: lookup failed for ${collection}/${id}:`, err.message);
    return { duplicate: false };
  }
}

/**
 * Finalise the claim after the handler has succeeded. Writes the
 * dedup doc with `processedAt` and any caller-provided metadata.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} collection
 * @param {string} id
 * @param {Record<string, unknown>=} meta  Optional fields to merge
 */
async function finaliseClaim(db, collection, id, meta) {
  if (!id) return;
  try {
    await db.collection(collection).doc(id).set(
      {
        ...(meta || {}),
        processedAt: Date.now(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error(`webhookIdempotency: finalise failed for ${collection}/${id}:`, err.message);
  }
}

module.exports = {
  checkClaim,
  finaliseClaim,
};

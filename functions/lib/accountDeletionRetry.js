"use strict";

async function cancelStripeSubscription({ stripeSubscriptionId }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe cancellation is unavailable");
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  } catch (error) {
    if (error.code !== "resource_missing") throw error;
  }
}

async function attemptCancellation({ ref, cancel, logger, now }) {
  const snap = await ref.get();
  if (!snap.exists) return false;
  try {
    await cancel({ stripeSubscriptionId: snap.data().stripeSubscriptionId, logger });
    await ref.delete();
    return false;
  } catch (error) {
    // Never log provider/customer identifiers or copy them into the user-readable ledger.
    logger.warn("deleteAccount.subscription_cancel_failed", { uid: ref.id, code: error.code || "unavailable" });
    const attempts = (snap.data().attempts || 0) + 1;
    await ref.update({
      attempts,
      nextAttemptAt: new Date(now + Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6))),
    });
    return true;
  }
}

async function queueAndCancelSubscription({ firestore, uid, cancelStripeSubscription: cancel, logger, now }) {
  const user = await firestore.collection("users").doc(uid).get();
  const ref = firestore.doc(`accountDeletionBilling/${uid}`);
  if (user.data()?.stripeSubscriptionId) {
    // A failed write here MUST stop deletion: this is the only durable copy
    // from which cancellation can recover after the user profile is erased.
    await ref.set({
      stripeSubscriptionId: user.data().stripeSubscriptionId,
      createdAt: new Date(now),
      nextAttemptAt: new Date(now),
    }, { merge: true });
  }
  return attemptCancellation({ ref, cancel: cancel || cancelStripeSubscription, logger, now });
}

async function resumeDeletions({ firestore, deleteAccount, auth, storageBucket, logger, now = Date.now(), deadline = Date.now() + 450000 }) {
  // Version gate: this worker may resume only requests authorised through the
  // new executor. It never initiates deletion for historical/abandoned records.
  const pending = await firestore.collection("accountDeletionRequests")
    .where("resumeVersion", "==", 2)
    .where("status", "in", ["running", "failed_cleanup", "pending_cleanup"])
    .where("nextAttemptAt", "<=", new Date(now))
    .orderBy("nextAttemptAt").limit(10).get();
  for (const doc of pending.docs) {
    if (Date.now() >= deadline) break;
    const data = doc.data();
    if (!["running", "failed_cleanup", "pending_cleanup"].includes(data.status)) continue;
    try {
      await deleteAccount({ firestore, auth, storageBucket, logger, uid: doc.id,
        cancelStripeSubscription, deadline, now: Date.now() });
    } catch (error) {
      logger.warn("deleteAccount.retry_pending", { uid: doc.id, code: error.code || "unavailable" });
    }
  }
}

async function retryBilling({ firestore, logger, now = Date.now(), cancel = cancelStripeSubscription, deadline = Date.now() + 60000 }) {
  const pending = await firestore.collection("accountDeletionBilling")
    .where("nextAttemptAt", "<=", new Date(now)).limit(20).get();
  for (const doc of pending.docs) {
    if (Date.now() >= deadline) break;
    await attemptCancellation({ ref: doc.ref, cancel, logger, now });
  }
}

module.exports = { queueAndCancelSubscription, cancelStripeSubscription, resumeDeletions, retryBilling };

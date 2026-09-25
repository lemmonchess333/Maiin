"use strict";

const { profileMergeFor } = require("./revenueCatEntitlement");

/**
 * Apply a resolved RevenueCat entitlement to `users/{uid}` — the write
 * half shared by the webhook and the sync callable, with the same four
 * guards the Stripe webhook runs, in the same order:
 *
 *   1. deletion lock — a deleting or tombstoned account takes no
 *      entitlement write; the event is logged post-deletion instead;
 *   2. stale guard — an event older than the last applied update is
 *      ignored (RevenueCat retries and re-orders; `subscriptionUpdatedAt`
 *      is Unix seconds, the same clock the Stripe path writes);
 *   3. lifetime guard — a lifetime purchase is never downgraded by a
 *      subscription event;
 *   4. cross-platform reconciliation — `resolveSubscriptionUpdate`
 *      decides tier/source and flags a Pro-on-another-store overlap for
 *      the forensic log.
 *
 * Collaborators are injected so the decision is testable without
 * firebase-admin: `db` (Firestore), `locks` (accountDeletionLocks),
 * `reconciliation` (subscriptionReconciliation), `logger`.
 *
 * Returns `{ applied, why }` — `why` names the guard that stopped it.
 */
async function applyRevenueCatEntitlement({
  db,
  uid,
  resolved,
  updatedAtSeconds,
  reason,
  providerEventId,
  eventType,
  locks,
  reconciliation,
  logger,
}) {
  const userRef = db.collection("users").doc(uid);

  if (!(await locks.shouldSystemWriteProceed(db, uid, reason))) {
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "revenuecat",
      externalTxnId: resolved.productId || "unknown",
      providerEventId: providerEventId || null,
      eventType: eventType || "sync",
      uid,
    });
    return { applied: false, why: "account-deleting" };
  }

  const snap = await userRef.get();
  const userData = snap.exists ? snap.data() || {} : {};

  const lastUpdate = Number(userData.subscriptionUpdatedAt) || 0;
  if (updatedAtSeconds && updatedAtSeconds < lastUpdate) {
    logger.info("revenueCat.stale_event_ignored", {
      uid,
      eventAt: updatedAtSeconds,
      lastUpdate,
    });
    return { applied: false, why: "stale" };
  }

  if (userData.planKind === "lifetime") {
    logger.info("revenueCat.lifetime_protected", { uid });
    return { applied: false, why: "lifetime" };
  }

  const decision = reconciliation.resolveSubscriptionUpdate({
    currentTier: userData.subscriptionTier,
    currentSource: userData.subscriptionSource,
    incomingTier: resolved.tier,
    incomingSource: resolved.source || reconciliation.SOURCE_IOS_IAP,
  });
  if (decision.conflict) {
    logger.warn("revenueCat.cross_platform_conflict", {
      uid,
      conflictReason: decision.conflictReason,
      newSource: decision.writeSource,
    });
  }

  const merge = profileMergeFor(
    resolved,
    decision,
    updatedAtSeconds || Math.floor(Date.now() / 1000)
  );
  await userRef.set(merge, { merge: true });
  return { applied: true, why: null, merge };
}

module.exports = { applyRevenueCatEntitlement };

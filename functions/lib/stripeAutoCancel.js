/**
 * Sub1 P2.5 — cancel the previously-active Stripe subscription
 * when a cross-platform IAP webhook overrides it.
 *
 * Wiring contract:
 *   1. `applySubscriptionToUser` (functions/applePurchase.js) detects
 *      `conflict: true` from `resolveSubscriptionUpdate` AND the
 *      previous source was `stripe`.
 *   2. It invokes this helper with stripe SDK + firestore handles.
 *   3. We look up the user doc, find `stripeSubscriptionId`, and call
 *      `stripe.subscriptions.cancel(id, { prorate: true })`.
 *
 * Why prorate (not full refund):
 *   - `prorate: true` posts a CREDIT NOTE for the unused portion of
 *     the billing period onto the customer balance — Stripe's
 *     canonical way to handle a mid-period cancel. No card refund,
 *     just credit toward any future Stripe invoice.
 *   - Direct refund-to-card would require a second
 *     `stripe.refunds.create({ charge: ... })` call AFTER looking up
 *     the latest charge for the sub. That opens an abuse path
 *     (subscribe-on-stripe, switch-to-iap, get-money-back, repeat).
 *     Operator-initiated refund stays the right tool for the rare
 *     genuine case; auto-refund stays out of band.
 *
 * Fail-soft contract:
 *   - Missing stripeSubscriptionId → no-op, success.
 *   - Stripe `resource_missing` (404, already canceled / never
 *     existed) → log + return success.
 *   - Any other Stripe error → throw. Caller wraps in try/catch and
 *     logs, so the IAP success path is never blocked by a Stripe
 *     hiccup.
 *
 * Pinned-by-test invariants live in
 * `__tests__/stripeAutoCancel.test.js`.
 */

async function cancelDisplacedStripeSub({
  stripe,
  firestore,
  uid,
  logger = console,
} = {}) {
  if (!stripe || !firestore || !uid) {
    throw new Error(
      "cancelDisplacedStripeSub: stripe, firestore, uid are required",
    );
  }

  // Read the user doc to find the Stripe subscription ID. We do
  // NOT wrap this in a transaction — the IAP webhook's own txn has
  // already committed the new `subscriptionSource: "ios_iap"` write
  // by the time this runs. We just need the lookup to find the
  // displaced sub.
  const snap = await firestore.collection("users").doc(uid).get();
  if (!snap.exists) {
    logger.info("cancelDisplacedStripeSub.no_user_doc", { uid });
    return { canceled: false, reason: "no-user-doc" };
  }
  const data = snap.data() || {};
  const stripeSubId = data.stripeSubscriptionId;
  if (!stripeSubId) {
    logger.info("cancelDisplacedStripeSub.no_stripe_sub_id", { uid });
    return { canceled: false, reason: "no-stripe-sub-id" };
  }

  try {
    await stripe.subscriptions.cancel(stripeSubId, { prorate: true });
    logger.info("cancelDisplacedStripeSub.canceled", {
      uid,
      stripeSubId,
    });
    return { canceled: true, stripeSubId };
  } catch (err) {
    // Stripe returns 404 / resource_missing if the sub doesn't
    // exist (already cancelled, or never existed) — desired end
    // state, treat as success.
    if (err && err.code === "resource_missing") {
      logger.info("cancelDisplacedStripeSub.already_gone", {
        uid,
        stripeSubId,
      });
      return { canceled: false, reason: "already-gone", stripeSubId };
    }
    // Any other error surfaces — caller catches + logs without
    // blocking the IAP path.
    throw err;
  }
}

module.exports = {
  cancelDisplacedStripeSub,
};

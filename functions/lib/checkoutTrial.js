/**
 * Sub1a P1 — server-side trial decision + atomic `hasUsedTrial`
 * write, extracted from `index.js` exports.createCheckoutSession so
 * the trial logic can be unit-tested against stub Stripe / Firestore
 * handles without booting firebase-admin. Also exports the
 * status→tier mapping used by the `customer.subscription.updated`
 * webhook so the `trialing → active` transition contract is pinned
 * by tests rather than living as a magic array inside the webhook.
 *
 * Contract (pinned by `__tests__/checkoutTrial.test.js`):
 *
 *   Input:
 *     - stripe          — Stripe SDK instance (only `.checkout.sessions.create` used here)
 *     - firestore       — admin.firestore() handle (uses `.runTransaction`)
 *     - uid             — caller's Firebase Auth UID (authoritative; never trust client)
 *     - priceId         — pre-allowlisted Stripe price ID
 *     - mode            — derived from server allowlist, not client (`subscription` | `payment`)
 *     - withTrial       — caller's intent. When true, the helper checks `hasUsedTrial` and either
 *                         grants the trial OR ignores the flag (no second-trial leak).
 *     - successUrl      — server-synthesised return URL (closed-set, allowlisted by caller)
 *     - cancelUrl       — server-synthesised cancel URL (closed-set, allowlisted by caller)
 *     - customerId      — already-resolved Stripe customer ID for the user
 *     - metadata        — opaque key/value pairs to attach to the Stripe session
 *
 *   Output:
 *     - { session, trialGranted }
 *
 * Trial-decision matrix:
 *
 *   withTrial | hasUsedTrial | Stripe subscription_data           | hasUsedTrial set?
 *   ----------|--------------|------------------------------------|------------------
 *   false     | any          | (omitted)                          | no
 *   true      | false        | { trial_period_days: 7 }           | YES, atomically
 *   true      | true         | (omitted)                          | no
 *
 * Atomicity:
 *   The `hasUsedTrial` read and the corresponding write live inside
 *   the same Firestore transaction, so two parallel checkout attempts
 *   can't both consume the trial slot. Abandoned checkouts still
 *   consume the slot — that's intentional per Sub1a pin #1 (prevents
 *   click-trial-bail-retry-trial loops; trial-shopping protection).
 */

const TRIAL_DAYS = 7;

async function createTrialCheckoutSession({
  stripe,
  firestore,
  uid,
  priceId,
  mode,
  withTrial,
  successUrl,
  cancelUrl,
  customerId,
  metadata,
}) {
  // Decide whether to grant a trial inside a Firestore transaction so
  // the read + write are atomic. The transaction body must be
  // idempotent under retry (Firestore may re-execute it on contention)
  // — Stripe session creation lives OUTSIDE the transaction for that
  // reason. Inside the txn we only flip the local `hasUsedTrial`
  // mirror; we commit the Stripe session afterward.
  const userRef = firestore.collection("users").doc(uid);

  const trialGranted = await firestore.runTransaction(async (txn) => {
    if (!withTrial) return false;

    const snap = await txn.get(userRef);
    const alreadyUsed = snap.exists && snap.data() && snap.data().hasUsedTrial === true;
    if (alreadyUsed) return false;

    // Race-safe consumption of the trial slot. Even if the user
    // abandons the Stripe checkout, the slot stays consumed — that's
    // the explicit Sub1a pin #1 protection against trial-shopping
    // loops.
    txn.set(userRef, { hasUsedTrial: true }, { merge: true });
    return true;
  });

  const sessionArgs = {
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  };

  if (trialGranted) {
    sessionArgs.subscription_data = { trial_period_days: TRIAL_DAYS };
  }

  const session = await stripe.checkout.sessions.create(sessionArgs);
  return { session, trialGranted };
}

/**
 * Stripe subscription status → Tropos subscription tier.
 *
 * Pinned-by-test mapping used inside the `customer.subscription.updated`
 * webhook handler. Both `active` and `trialing` grant Pro — so the
 * Sub1a `trialing → active` transition is a no-op at the tier level
 * (the user stays Pro), which is exactly the intent: trial-to-paid
 * conversion should be invisible from the user's perspective.
 *
 * All other statuses (incomplete, incomplete_expired, past_due,
 * canceled, unpaid) downgrade the user to free. Stripe's 3-day
 * grace period for `past_due` (Sub1c) is implemented further up the
 * stack via the dunning timeline — this mapping is the final fall-off.
 */
const ACTIVE_STRIPE_STATUSES = Object.freeze(["active", "trialing"]);

function mapSubscriptionStatusToTier(status) {
  return ACTIVE_STRIPE_STATUSES.includes(status) ? "pro" : "free";
}

module.exports = {
  TRIAL_DAYS,
  ACTIVE_STRIPE_STATUSES,
  createTrialCheckoutSession,
  mapSubscriptionStatusToTier,
};

/**
 * Decide whether a Stripe `customer.subscription.deleted` event should be
 * IGNORED (i.e. NOT downgrade the user to free). Pure — no Firestore I/O — so
 * the guard set is unit-testable and the F3 fix is pinned (mirrors the
 * `resolveSubscriptionUpdate` reconciliation contract used by the
 * `updated` / `completed` handlers).
 *
 * Ignore iff ANY of:
 *   - `no-user`        — no stored user data (defensive; caller also guards).
 *   - `lifetime`       — lifetime entitlement is never downgraded by sub events.
 *   - `owned-by-<src>` — the live entitlement is owned by a NON-Stripe source
 *                        (money-path audit F3). A Stripe→Apple migration
 *                        auto-cancels the displaced Stripe subscription, which
 *                        fires this event; the Apple write leaves
 *                        `stripeSubscriptionId` set and does not bump
 *                        `subscriptionUpdatedAt`, so the id-match + staleness
 *                        guards both pass and — without this guard — the handler
 *                        strips the freshly-purchased Apple Pro. A falsy
 *                        `subscriptionSource` (legacy Stripe-era doc) is treated
 *                        as Stripe-owned, so a genuine Stripe cancel still
 *                        downgrades.
 *   - `sub-id-mismatch`— the stored subscription id differs from the deleted
 *                        one (a different sub was cancelled; ours is still live).
 *   - `stale`          — a newer subscription update already landed.
 *
 * @param {{ userData: object|null|undefined, subscriptionId: string,
 *           eventCreated: number|undefined }} input
 * @returns {{ ignore: boolean, reason: string|null }}
 */
function shouldIgnoreSubscriptionDeleted({ userData, subscriptionId, eventCreated }) {
  if (!userData) return { ignore: true, reason: "no-user" };

  if (userData.planKind === "lifetime") {
    return { ignore: true, reason: "lifetime" };
  }

  // F3 — source-ownership guard. Only downgrade when the entitlement is (still)
  // Stripe's. A non-Stripe source means the user migrated; this cancel is the
  // displaced Stripe sub being cleaned up, not a loss of Pro.
  if (userData.subscriptionSource && userData.subscriptionSource !== "stripe") {
    return { ignore: true, reason: `owned-by-${userData.subscriptionSource}` };
  }

  if (
    userData.stripeSubscriptionId &&
    userData.stripeSubscriptionId !== subscriptionId
  ) {
    return { ignore: true, reason: "sub-id-mismatch" };
  }

  const lastUpdate = Number(userData.subscriptionUpdatedAt) || 0;
  if (eventCreated && eventCreated <= lastUpdate) {
    return { ignore: true, reason: "stale" };
  }

  return { ignore: false, reason: null };
}

module.exports = { shouldIgnoreSubscriptionDeleted };

/**
 * Small, server-owned billing facts for the first-week cohort report.
 *
 * Keep only the first provider-verified trial and first paid period per account.
 * No receipt, transaction id, price, email or client analytics event belongs
 * here. These fields live on users/{uid}, so account deletion erases them with
 * the profile. A late provider event may correct a first to an earlier time.
 */

const PLATFORMS = new Set(["ios", "web", "android"]);
const SOURCES = new Set(["ios_iap", "stripe"]);

function validOnboardingPlatform(value) {
  return PLATFORMS.has(value);
}

function validObservation(value) {
  return (
    value &&
    (value.kind === "trial" || value.kind === "paid") &&
    SOURCES.has(value.source) &&
    Number.isSafeInteger(value.atMs) &&
    value.atMs > 0
  );
}

/** Return a new map only when a verified observation improves it. */
function nextBillingFirsts(current, observation) {
  if (!validObservation(observation)) return null;
  const firsts = current && typeof current === "object" ? current : {};
  const before = firsts[observation.kind];
  if (
    before &&
    Number.isSafeInteger(before.atMs) &&
    before.atMs <= observation.atMs
  )
    return null;
  return {
    ...firsts,
    [observation.kind]: {
      atMs: observation.atMs,
      source: observation.source,
    },
  };
}

/**
 * The RevenueCat REST snapshot has already passed the entitlement, store,
 * production and cross-platform checks in syncUser. A trial start comes from
 * the verified trial purchase; a paid start needs a normal subscription
 * period and purchase date. RevenueCat does not expose a charge amount in
 * this REST snapshot, so this is a paid-period observation, not a receipt.
 */
function revenueCatObservation(snapshot, outcome) {
  if (
    outcome.result !== "granted" ||
    outcome.conflict ||
    !snapshot.active ||
    snapshot.sandbox ||
    (snapshot.store !== "app_store" && snapshot.store !== "mac_app_store")
  )
    return null;
  if (snapshot.trial) {
    if (snapshot.trial.startedAtMs > snapshot.syncedAtMs) return null;
    return {
      kind: "trial",
      source: "ios_iap",
      atMs: snapshot.trial.startedAtMs,
    };
  }
  if (snapshot.periodType !== "normal") return null;
  if (snapshot.purchaseAtMs > snapshot.syncedAtMs) return null;
  return {
    kind: "paid",
    source: "ios_iap",
    atMs: snapshot.purchaseAtMs,
  };
}

/** Signed Stripe subscription events can establish a trial, not a charge. */
function stripeTrialObservation(subscription) {
  if (subscription?.status !== "trialing") return null;
  const start = subscription.trial_start;
  return Number.isSafeInteger(start) && start > 0
    ? { kind: "trial", source: "stripe", atMs: start * 1000 }
    : null;
}

/** A signed paid Checkout session or positive paid invoice is a charge. */
function stripePaidObservation(event) {
  if (event?.livemode !== true) return null;
  const obj = event?.data?.object;
  if (event?.type === "checkout.session.completed") {
    if (
      obj?.mode !== "subscription" ||
      !obj.subscription ||
      obj?.payment_status !== "paid" ||
      !Number.isSafeInteger(obj.amount_total) ||
      obj.amount_total <= 0
    )
      return null;
  } else if (event?.type === "invoice.paid") {
    if (!Number.isSafeInteger(obj?.amount_paid) || obj.amount_paid <= 0)
      return null;
  } else {
    return null;
  }
  const at = event.created;
  return Number.isSafeInteger(at) && at > 0
    ? { kind: "paid", source: "stripe", atMs: at * 1000 }
    : null;
}

module.exports = {
  validOnboardingPlatform,
  nextBillingFirsts,
  revenueCatObservation,
  stripeTrialObservation,
  stripePaidObservation,
};

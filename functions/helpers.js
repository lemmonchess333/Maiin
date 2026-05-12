/**
 * PR Q (audit P0 #1/#2/#3 follow-up): pure helpers extracted from
 * index.js into a no-deps module so the test runner can import them
 * without booting firebase-admin.
 *
 * Each helper is a re-export of the original underscore-prefixed
 * version in index.js. index.js continues to define its own copies
 * for backwards compatibility — this module is the test surface and
 * the single source of truth going forward. If a helper needs
 * editing, update it here and have index.js delegate.
 */

/**
 * Prune timestamps to those still inside the rolling window.
 * Stamp comparison is `now - t < windowMs` so a 60s-old call inside
 * a 60_000ms window is just outside (pruned) — conservative on the
 * boundary in the caller's favour (rate limit clears one tick
 * faster).
 */
function pruneOldTimestamps(timestamps, now, windowMs) {
  if (!Array.isArray(timestamps)) return [];
  return timestamps.filter((t) => typeof t === "number" && now - t < windowMs);
}

/**
 * Compute the effective subscription tier from a user profile
 * doc's data. Pro paid > Pro trial > Free. Pure: no admin SDK.
 */
function computeEffectiveTier(userData, now = new Date()) {
  if (!userData) return "free";
  if (userData.subscriptionTier === "pro") return "pro";
  if (userData.trialExpiresAt) {
    const expiresAt = new Date(userData.trialExpiresAt);
    if (!isNaN(expiresAt.getTime()) && expiresAt > now) return "pro";
  }
  return "free";
}

/**
 * Current usage count after accounting for month rollover.
 * Returns 0 when the stored month differs from `currentMonth`
 * (rollover) or when usage is missing entirely (first scan in
 * a new month / new user).
 */
function currentMonthCount(usageData, currentMonth) {
  if (!usageData || usageData.month !== currentMonth) return 0;
  return Number(usageData.count) || 0;
}

/**
 * Build the Stripe price allowlist from environment variables.
 * Returns an object keyed by price ID; missing env vars are
 * silently omitted (fail-closed: price not in allowlist means
 * checkoutSession refuses to create it). Reads env at call time
 * so tests can mutate process.env before invocation.
 */
function getStripePriceAllowlist() {
  const monthly = process.env.STRIPE_PRICE_ID_MONTHLY;
  const yearly = process.env.STRIPE_PRICE_ID_YEARLY;
  const lifetime = process.env.STRIPE_PRICE_ID_LIFETIME;
  const allowlist = {};
  if (monthly) allowlist[monthly] = { kind: "monthly", mode: "subscription" };
  if (yearly) allowlist[yearly] = { kind: "yearly", mode: "subscription" };
  if (lifetime) allowlist[lifetime] = { kind: "lifetime", mode: "payment" };
  return allowlist;
}

module.exports = {
  pruneOldTimestamps,
  computeEffectiveTier,
  currentMonthCount,
  getStripePriceAllowlist,
};

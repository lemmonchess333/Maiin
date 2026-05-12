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

const PROD_STRIPE_RETURN_URL_ORIGINS = [
  "https://troposfit.com",
  "https://www.troposfit.com",
];

const STAGING_STRIPE_RETURN_URL_ORIGINS = [
  "https://lemmonchess333.github.io",
];

const LOCAL_STRIPE_RETURN_URL_ORIGINS = [
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
];

// Capacitor/iOS origins are intentionally NOT in this allowlist.
// iOS subscriptions must use Apple IAP per App Store policy; a
// Stripe Checkout web flow inside the iOS WebView would risk app
// rejection. Do not add capacitor://localhost.
//
// FOLLOWUP(payment-security): split this allowlist by deploy
//   environment so staging origins only ship in staging builds.
// FOLLOWUP(payment-security): audit other endpoints accepting
//   client-controlled URLs (password reset, share links, OAuth
//   redirect, webhook callbacks).
function normalizeOriginEntry(entry) {
  try {
    const parsed = new URL(String(entry).trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch (_) {
    return null;
  }
}

function getDefaultStripeReturnUrlOrigins() {
  // FUNCTIONS_EMULATOR is "true" only when running via firebase
  // emulators:start. Localhost origins are intentionally limited
  // to emulator runs so deployed prod functions cannot redirect
  // Stripe Checkout back to a developer's machine.
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return [
      ...PROD_STRIPE_RETURN_URL_ORIGINS,
      ...STAGING_STRIPE_RETURN_URL_ORIGINS,
      ...LOCAL_STRIPE_RETURN_URL_ORIGINS,
    ];
  }
  return [
    ...PROD_STRIPE_RETURN_URL_ORIGINS,
    ...STAGING_STRIPE_RETURN_URL_ORIGINS,
  ];
}

function getConfiguredStripeReturnUrlOrigins() {
  const raw = process.env.STRIPE_RETURN_URL_ORIGINS;
  if (!raw || !raw.trim()) return null;
  const normalized = raw
    .split(",")
    .map(normalizeOriginEntry)
    .filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : null;
}

function getAllowedStripeReturnUrlOrigins() {
  return getConfiguredStripeReturnUrlOrigins() ||
    getDefaultStripeReturnUrlOrigins();
}

/**
 * Validate Stripe Checkout return URLs before handing them to Stripe.
 * Checkout redirects are user-visible after payment/cancel, so
 * accepting arbitrary client-supplied URLs would let any authenticated
 * caller bounce a payment flow through a phishing domain.
 *
 * Defence-in-depth around the URL parser:
 *  - reject anything that isn't http/https (drops data:, vbscript:,
 *    file:, javascript:, protocol-relative `//evil.com`)
 *  - compare against `parsed.origin` (kills userinfo confusion
 *    `https://troposfit.com@evil.com`, suffix phishing
 *    `troposfit.com.evil.com`, non-default-port mismatch)
 *  - origin normalisation strips default ports and lowercases the
 *    scheme + host, so `HTTPS://Troposfit.COM:443` matches
 *    `https://troposfit.com`
 *  - Unicode lookalikes (full-width dots etc.) don't decompose to
 *    ASCII via the URL parser so they fail the allowlist lookup
 */
function isAllowedStripeReturnUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  return getAllowedStripeReturnUrlOrigins().includes(parsed.origin);
}

/** Origin-only redaction for log fields. Returns null on parse
 *  failure so structured-log destinations don't capture raw
 *  untrusted strings. */
function safeOriginForLog(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  try {
    return new URL(rawUrl).origin;
  } catch (_) {
    return null;
  }
}

module.exports = {
  pruneOldTimestamps,
  computeEffectiveTier,
  currentMonthCount,
  getStripePriceAllowlist,
  isAllowedStripeReturnUrl,
  getAllowedStripeReturnUrlOrigins,
  safeOriginForLog,
};

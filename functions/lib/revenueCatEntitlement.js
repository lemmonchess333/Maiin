"use strict";

/**
 * RevenueCat → profile entitlement, the pure half.
 *
 * ADR-0006 made RevenueCat the IAP layer and the backend "a single path:
 * receive the RevenueCat webhook → write subscriptionTier /
 * subscriptionExpiresAt". The client shipped against that contract
 * (`purchaseWithRevenueCat` nudges `syncRevenueCatEntitlement` after a
 * purchase and otherwise trusts the webhook), but neither function was
 * ever built — an iOS purchase completed at Apple and RevenueCat and
 * changed nothing in Firestore. This module is the decision both
 * functions share; index.js owns the I/O around it.
 *
 * Two inputs, one output:
 *   - a webhook EVENT (`body.event`), the shape RevenueCat POSTs:
 *     type, app_user_id, product_id, entitlement_ids, period_type
 *     (NORMAL | TRIAL | INTRO | PROMOTIONAL), expiration_at_ms, store,
 *     environment, event_timestamp_ms, id;
 *   - a SUBSCRIBER (`GET /v1/subscribers/{app_user_id}` → `.subscriber`):
 *     entitlements[id].expires_date, subscriptions[product].period_type
 *     ("normal" | "trial" | "intro"), .expires_date, .store.
 *
 * Output — the profile write, minus anything that needs Firestore:
 *   { tier, source, expiresAt, trialEndsAt, productId, usedTrial }
 *   tier        "pro" while the `pro` entitlement is live, else "free"
 *   source      ios_iap | android_iap | stripe, from the store
 *   expiresAt   ISO, or null for a lifetime/unknown expiry
 *   trialEndsAt ISO while the live period is a TRIAL, else null — the
 *               field the day-5 reminder and the Home strip read; Apple
 *               sends no reminder before an introductory offer converts
 *   usedTrial   true when a trial period is or was in play, so checkout
 *               and the Food strip stop promising a free trial Apple will
 *               not honour twice
 *
 * The app's App User ID is the Firebase uid (`revenuecat.ts` logs in
 * with it), so `app_user_id` IS the profile id. RevenueCat's anonymous
 * ids (`$RCAnonymousID:…`) can arrive on events for a device that never
 * logged in; there is no profile for them and they are skipped.
 */

const PRO_ENTITLEMENT_ID = "pro";
const ANONYMOUS_PREFIX = "$RCAnonymousID:";

const STORE_TO_SOURCE = Object.freeze({
  APP_STORE: "ios_iap",
  MAC_APP_STORE: "ios_iap",
  PLAY_STORE: "android_iap",
  AMAZON: "android_iap",
  STRIPE: "stripe",
  PROMOTIONAL: "ios_iap",
});

/** Event types that carry entitlement state worth writing. */
const ENTITLEMENT_EVENT_TYPES = Object.freeze([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "CANCELLATION",
  "UNCANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "SUBSCRIPTION_PAUSED",
  "SUBSCRIPTION_EXTENDED",
  "TRANSFER",
  "NON_RENEWING_PURCHASE",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

function isAnonymousAppUserId(id) {
  return typeof id === "string" && id.startsWith(ANONYMOUS_PREFIX);
}

function sourceForStore(store) {
  return STORE_TO_SOURCE[String(store || "").toUpperCase()] || null;
}

function isoOrNull(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

/**
 * Validate the webhook body and lift out the event. Returns
 * `{ ok: true, event }` or `{ ok: false, reason }` — never throws on
 * shape, so the handler can 400 with a reason and RevenueCat's retry
 * does not hammer a payload that will never parse.
 * @param {unknown} body
 */
function parseWebhookBody(body) {
  const event = body && typeof body === "object" ? body.event : null;
  if (!event || typeof event !== "object") {
    return { ok: false, reason: "missing event" };
  }
  if (typeof event.type !== "string" || !event.type) {
    return { ok: false, reason: "missing event.type" };
  }
  if (typeof event.id !== "string" || !event.id) {
    return { ok: false, reason: "missing event.id" };
  }
  if (typeof event.app_user_id !== "string" || !event.app_user_id) {
    return { ok: false, reason: "missing event.app_user_id" };
  }
  return { ok: true, event };
}

/** Event types with an expiry but no renewal to switch off. */
const NON_RENEWING_EVENT_TYPES = Object.freeze([
  "NON_RENEWING_PURCHASE",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

/**
 * Whether the live subscription will renew (or a trial convert) when
 * the expiry arrives. CANCELLATION is auto-renew off — access runs to
 * the expiry and stops — and UNCANCELLATION turns it back on; every
 * other live, renewing event means "on". Null when there is nothing to
 * renew: no live access, no expiry (lifetime), or a purchase that never
 * renews. The reminder and Settings read this so a user who has already
 * cancelled is never told their subscription "starts unless you cancel".
 * @param {string} type
 * @param {boolean} live
 * @param {string | null} expiresAt
 * @returns {boolean | null}
 */
function autoRenewForEvent(type, live, expiresAt) {
  if (!live || expiresAt === null) return null;
  if (NON_RENEWING_EVENT_TYPES.includes(type)) return null;
  return type !== "CANCELLATION";
}

/**
 * The entitlement a webhook event implies, or null when the event is
 * not one to act on (TEST pings, anonymous ids, types outside the
 * entitlement set).
 * @param {object} event  the parsed `body.event`
 * @param {Date} [now]
 */
function resolveEntitlementFromEvent(event, now = new Date()) {
  if (!ENTITLEMENT_EVENT_TYPES.includes(event.type)) return null;
  if (isAnonymousAppUserId(event.app_user_id)) return null;

  const ids = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids
    : event.entitlement_id
      ? [event.entitlement_id]
      : [];
  const grantsPro = ids.includes(PRO_ENTITLEMENT_ID);
  const expiresAt = isoOrNull(event.expiration_at_ms);
  const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const live =
    grantsPro &&
    event.type !== "EXPIRATION" &&
    (expiresAt === null || expiresMs > now.getTime());

  const periodType = String(event.period_type || "").toUpperCase();
  const inTrial = live && periodType === "TRIAL";

  return {
    tier: live ? "pro" : "free",
    source: sourceForStore(event.store),
    expiresAt,
    trialEndsAt: inTrial ? expiresAt : null,
    autoRenew: autoRenewForEvent(event.type, live, expiresAt),
    productId: typeof event.product_id === "string" ? event.product_id : null,
    usedTrial: periodType === "TRIAL",
    environment:
      typeof event.environment === "string" ? event.environment : null,
    eventTimestampMs: Number(event.event_timestamp_ms) || null,
  };
}

/**
 * The entitlement a subscriber record implies (the REST sync path, run
 * right after a purchase to close the purchase→webhook latency gap).
 * @param {object} subscriber  `response.subscriber`
 * @param {Date} [now]
 */
function resolveEntitlementFromSubscriber(subscriber, now = new Date()) {
  const entitlements = (subscriber && subscriber.entitlements) || {};
  const pro = entitlements[PRO_ENTITLEMENT_ID] || null;
  const subscriptions = (subscriber && subscriber.subscriptions) || {};

  const productId =
    pro && typeof pro.product_identifier === "string"
      ? pro.product_identifier
      : null;
  const sub = productId ? subscriptions[productId] || null : null;

  const expiresAt =
    pro && typeof pro.expires_date === "string"
      ? new Date(pro.expires_date).toISOString()
      : null;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const live = !!pro && (expiresAt === null || expiresMs > now.getTime());

  const periodType = String((sub && sub.period_type) || "").toLowerCase();
  const inTrial = live && periodType === "trial";
  // `unsubscribe_detected_at` is set once the user has turned auto-renew
  // off in the store and cleared if they turn it back on.
  const autoRenew =
    live && expiresAt !== null && sub
      ? !sub.unsubscribe_detected_at
      : null;
  // A trial that has already converted or lapsed still counts as used:
  // RevenueCat keeps the subscription row with its period type.
  const everTrial =
    periodType === "trial" ||
    Object.values(subscriptions).some(
      (s) => String((s && s.period_type) || "").toLowerCase() === "trial"
    );

  return {
    tier: live ? "pro" : "free",
    source: sourceForStore(sub && sub.store),
    expiresAt,
    trialEndsAt: inTrial ? expiresAt : null,
    autoRenew,
    productId,
    usedTrial: everTrial,
    environment: null,
    eventTimestampMs: null,
  };
}

/**
 * The profile merge for a resolved entitlement, given the reconciliation
 * decision (tier/source after the cross-platform check) — one shape for
 * the webhook and the sync callable, so the two cannot drift.
 * @param {object} resolved  from resolveEntitlementFrom*
 * @param {{ writeTier: string, writeSource: string | null }} decision
 * @param {number} updatedAtSeconds
 */
function profileMergeFor(resolved, decision, updatedAtSeconds) {
  const merge = {
    subscriptionTier: decision.writeTier,
    subscriptionSource: decision.writeSource,
    subscriptionExpiresAt: resolved.expiresAt,
    subscriptionTrialEndsAt: resolved.trialEndsAt,
    subscriptionAutoRenew: resolved.autoRenew,
    subscriptionUpdatedAt: updatedAtSeconds,
  };
  if (resolved.productId) merge.appleProductId = resolved.productId;
  if (resolved.usedTrial) merge.hasUsedTrial = true;
  return merge;
}

module.exports = {
  PRO_ENTITLEMENT_ID,
  autoRenewForEvent,
  ENTITLEMENT_EVENT_TYPES,
  isAnonymousAppUserId,
  sourceForStore,
  parseWebhookBody,
  resolveEntitlementFromEvent,
  resolveEntitlementFromSubscriber,
  profileMergeFor,
};

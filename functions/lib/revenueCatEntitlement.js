/**
 * RevenueCat entitlement resolution — pure helpers (IAP slice 3).
 *
 * No firebase, no network, no clock of its own. Everything here is a
 * function of its arguments so the webhook's decisions can be tested
 * without an emulator, which is the only way any of this gets exercised
 * before a sandbox device exists (docs/iap/revenuecat-setup.md: slices
 * 2-8 can only be *truly* verified on device).
 *
 * The shapes come from RevenueCat's own documented contracts:
 *   - Webhook envelope: { api_version, event: { id, type, app_user_id,
 *     event_timestamp_ms, ... } }
 *   - REST v1 `GET /subscribers/{app_user_id}` → { subscriber: {
 *     entitlements: { <id>: { expires_date, grace_period_expires_date,
 *     product_identifier } }, subscriptions: { <product_id>: { store } } } }
 *
 * WHY THE WEBHOOK EVENT'S OWN EXPIRY IS NOT USED. The event carries
 * `expiration_at_ms`, and writing it straight through is the obvious
 * implementation. It is also the one that breaks on out-of-order
 * delivery, which RevenueCat makes no promise against: a late EXPIRATION
 * for a subscription the user has already replaced would downgrade a
 * paying account. Guarding that with a stored ordering key means a new
 * server-only field on the user doc, a firestore.rules edit and a
 * registry entry (src/lib/profileFieldRegistry.ts pins all three).
 *
 * Fetching the subscriber instead makes the ordering problem disappear
 * rather than defending against it. Every event resolves to "what is
 * true right now", so a late arrival writes the same bytes as the event
 * that overtook it. The cost is one REST call per event and a hard
 * dependency on RevenueCat being reachable — and failing closed there is
 * correct, because the alternative is writing entitlement state from a
 * payload we already know can be stale.
 */
"use strict";

/** Must match `PRO_ENTITLEMENT_ID` in src/lib/revenuecat.ts and the
 *  entitlement created in docs/iap/revenuecat-setup.md Part B3. */
const PRO_ENTITLEMENT_ID = "pro";

/**
 * RevenueCat store → `subscriptionSource` (lib/subscriptionReconciliation.js
 * VALID_SOURCES). The field answers "which platform owns this entitlement",
 * because that is what the client uses it for: AccountSection routes Manage
 * Subscription by it and Upgrade.tsx compares it against the running
 * platform. It is deliberately NOT a record of which SDK wrote the row —
 * a RevenueCat purchase on iOS is still an App Store subscription the user
 * manages in iOS Settings, and tagging it `revenuecat` would send those
 * users to the wrong management surface. The pipeline that wrote the row is
 * recorded on the revenueCatEvents doc instead, where forensics belong.
 */
const STORE_TO_SOURCE = Object.freeze({
  app_store: "ios_iap",
  mac_app_store: "ios_iap",
  play_store: "android_iap",
  amazon: "android_iap",
  stripe: "stripe",
  rc_billing: "stripe",
  paddle: "stripe",
});

/**
 * The store to assume when the entitlement names no subscription we can
 * classify — a dashboard promotional grant is the ordinary case, and it
 * carries no store at all.
 *
 * ADR-0006 locked v1 as iOS-only, so App Store is the only store this
 * project can actually transact through, and a comp granted here is an
 * iOS entitlement in every sense the client cares about. Revisit when
 * Android or RC Web Billing lands: at that point an unclassifiable grant
 * is genuinely ambiguous and should be logged rather than guessed.
 */
const FALLBACK_SOURCE = "ios_iap";

/**
 * Constant-time string compare for the webhook's shared secret.
 *
 * `===` on a secret leaks its prefix through timing. The length check
 * ahead of the loop leaks only the length, which is not the secret, and
 * skipping it would compare against undefined bytes.
 */
function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** ISO-8601 or ms-epoch → ms number, or null for absent/unparseable. */
function toMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pull the parts of a webhook POST body this handler acts on.
 *
 * Returns null rather than throwing on a body that isn't shaped like an
 * event — the caller answers those with 400, and a malformed body is not
 * an exceptional condition on a public endpoint.
 */
function parseWebhookEnvelope(body) {
  const event = body && body.event;
  if (!event || typeof event !== "object") return null;
  const eventId = typeof event.id === "string" ? event.id : null;
  const appUserId =
    typeof event.app_user_id === "string" && event.app_user_id
      ? event.app_user_id
      : null;
  if (!eventId || !appUserId) return null;
  return {
    eventId,
    appUserId,
    type: typeof event.type === "string" ? event.type : "UNKNOWN",
    environment:
      typeof event.environment === "string" ? event.environment : null,
    store: typeof event.store === "string" ? event.store : null,
    eventTimestampMs: toMs(event.event_timestamp_ms),
  };
}

/**
 * Resolve the Pro entitlement from a REST subscriber object.
 *
 * Absent entitlement means revoked — RevenueCat drops the key rather
 * than marking it inactive, so "not in the map" is the downgrade signal
 * and there is no inactive-but-present state to interpret.
 *
 * `expires_date: null` on a PRESENT entitlement is the documented
 * no-expiration case (lifetime, or a dashboard comp). That maps to
 * `expiresAt: null`, which helpers.js computeEffectiveTier already
 * treats as active — the same fall-through legacy docs rely on.
 *
 * A grace period outlives the paid term on purpose: RevenueCat keeps the
 * entitlement alive through billing retry, and cutting the user off
 * before their own store has given up is the wrong direction to err.
 */
function entitlementFromSubscriber(subscriber, now = new Date()) {
  const entitlements = (subscriber && subscriber.entitlements) || {};
  const ent = entitlements[PRO_ENTITLEMENT_ID];
  if (!ent || typeof ent !== "object") {
    return { isActive: false, expiresAt: null, productId: null, store: null };
  }

  const productId =
    typeof ent.product_identifier === "string" ? ent.product_identifier : null;
  const subscriptions = (subscriber && subscriber.subscriptions) || {};
  const subscription = productId ? subscriptions[productId] : null;
  const store =
    subscription && typeof subscription.store === "string"
      ? subscription.store
      : null;

  const expiresMs = toMs(ent.expires_date);
  const graceMs = toMs(ent.grace_period_expires_date);

  // Present with no expiry of any kind — lifetime / comp.
  if (expiresMs === null && graceMs === null) {
    return { isActive: true, expiresAt: null, productId, store };
  }

  const untilMs = Math.max(
    expiresMs === null ? -Infinity : expiresMs,
    graceMs === null ? -Infinity : graceMs
  );
  return {
    isActive: untilMs > now.getTime(),
    expiresAt: new Date(untilMs).toISOString(),
    productId,
    store,
  };
}

/**
 * `subscriptionSource` for an entitlement, or null when it is not a Pro
 * write (a downgrade nulls the source — resolveSubscriptionUpdate owns
 * that, and asking for a source on a free write would invite a caller to
 * pass one).
 */
function sourceForEntitlement(entitlement) {
  if (!entitlement || !entitlement.isActive) return null;
  const mapped = entitlement.store
    ? STORE_TO_SOURCE[entitlement.store]
    : undefined;
  return mapped || FALLBACK_SOURCE;
}

module.exports = {
  PRO_ENTITLEMENT_ID,
  STORE_TO_SOURCE,
  FALLBACK_SOURCE,
  constantTimeEquals,
  parseWebhookEnvelope,
  entitlementFromSubscriber,
  sourceForEntitlement,
  toMs,
};

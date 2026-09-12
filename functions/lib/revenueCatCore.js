/**
 * RevenueCat webhook core — IAP slice 3 backend logic (#1099).
 *
 * Pure module: no firebase-functions, no firebase-admin, no network.
 * Everything effectful (firestore handle, deletion locks, server
 * timestamp, fetch) is injected, so the full pipeline is unit-testable
 * with stubs — the same split applePurchase.js (logic) / appleIAP.js
 * (triggers) uses, and for the same reason.
 *
 * Trust + invariants documented on each function; the trigger wrapper
 * in ../revenueCat.js owns auth, secrets, and admin wiring.
 */
const crypto = require("crypto");

const RC_EVENTS_COLLECTION = "revenuecatEvents";

/**
 * Constant-time equality for the webhook Authorization header. Length
 * mismatch short-circuits (timingSafeEqual throws on unequal lengths;
 * leaking length equality is acceptable for a high-entropy shared secret).
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Map a RevenueCat event to the subscription write it implies.
 *
 * Event reference: https://www.revenuecat.com/docs/webhooks — the fields
 * used here (`type`, `app_user_id`, `expiration_at_ms`, `id`) are stable
 * across event types.
 *
 * @returns {{action: 'apply', tier: 'pro'|'free', expiresAtMs: number|null}
 *   | {action: 'ignore', reason: string}}
 */
function mapRevenueCatEvent(event) {
  const type = event && event.type;
  const expiresAtMs =
    typeof event?.expiration_at_ms === "number" ? event.expiration_at_ms : null;

  switch (type) {
    // Grants / extensions — Pro until the event's expiration.
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
      return { action: "apply", tier: "pro", expiresAtMs };

    // Auto-renew switched off: the user stays entitled until expiry.
    // Record the (possibly updated) expiry but do NOT downgrade — the
    // EXPIRATION event does that when the paid period actually ends.
    case "CANCELLATION":
      return expiresAtMs
        ? { action: "apply", tier: "pro", expiresAtMs }
        : { action: "ignore", reason: "cancellation-without-expiry" };

    case "EXPIRATION":
      return { action: "apply", tier: "free", expiresAtMs };

    // Billing retry window — Apple/RC keep the entitlement alive through
    // grace; the terminal EXPIRATION arrives if recovery fails.
    case "BILLING_ISSUE":
      return { action: "ignore", reason: "billing-issue-grace" };

    // RC dashboard "send test event" — must 200 so operator setup
    // verification (setup doc Part B8) reads green.
    case "TEST":
      return { action: "ignore", reason: "test-event" };

    default:
      return { action: "ignore", reason: `unhandled-type:${type}` };
  }
}

/**
 * Apply a mapped event to users/{uid} inside a transaction, honouring the
 * lifetime + stale-event invariants. Injectable firestore for tests.
 *
 * @returns {Promise<{result: 'applied'|'no-user-match'|'skipped-lifetime'|'skipped-stale', tier?: string}>}
 */
async function applyRevenueCatEntitlement({
  firestore,
  uid,
  tier,
  expiresAtMs,
  logger = console,
}) {
  const userRef = firestore.collection("users").doc(uid);
  return firestore.runTransaction(async (txn) => {
    const snap = await txn.get(userRef);
    if (!snap.exists) {
      logger.warn(`revenueCatWebhook: no user doc for uid=${uid}`);
      return { result: "no-user-match" };
    }
    const userData = snap.data() || {};

    if (userData.planKind === "lifetime") {
      logger.log(
        `revenueCatWebhook: skipping for uid=${uid} — lifetime entitlement`
      );
      return { result: "skipped-lifetime" };
    }

    // Stale / out-of-order protection (RC retries + redeliveries arrive
    // unordered under load, same as Apple): an event whose expiry is
    // older than what we already hold cannot move state in either
    // direction.
    const storedRaw = userData.subscriptionExpiresAt;
    const storedMs = storedRaw ? Date.parse(storedRaw) : null;
    if (
      typeof expiresAtMs === "number" &&
      typeof storedMs === "number" &&
      !Number.isNaN(storedMs) &&
      expiresAtMs < storedMs
    ) {
      return { result: "skipped-stale" };
    }

    const write = {
      subscriptionTier: tier,
      subscriptionSource: "revenuecat",
    };
    if (typeof expiresAtMs === "number") {
      write.subscriptionExpiresAt = new Date(expiresAtMs).toISOString();
    }
    txn.set(userRef, write, { merge: true });
    return { result: "applied", tier };
  });
}

/**
 * Full processing pipeline for one webhook delivery: dedup → identity
 * guard → deletion lock → apply → finalise dedup record. Extracted so
 * tests drive it without the express wrapper, mirroring how
 * applePurchase.test.js pins applySubscriptionToUser.
 *
 * @returns {Promise<{status: number, result: string}>}
 */
async function processRevenueCatEvent({
  firestore,
  event,
  locks,
  serverTimestamp = () => null,
  logger = console,
}) {
  if (!event || typeof event !== "object") {
    return { status: 400, result: "malformed" };
  }
  const eventId = typeof event.id === "string" ? event.id : null;
  const dedupRef = eventId
    ? firestore.collection(RC_EVENTS_COLLECTION).doc(eventId)
    : null;

  // Dedup read — RC retries on non-2xx; a redelivery must be a no-op.
  // A failed lookup logs and proceeds (same trade as appleIAPWebhook:
  // better a rare double-process of an idempotent write than a stuck
  // retry loop).
  if (dedupRef) {
    try {
      const existing = await dedupRef.get();
      if (existing.exists) {
        logger.log(
          `revenueCatWebhook: duplicate delivery for ${eventId}, skipping`
        );
        return { status: 200, result: "duplicate" };
      }
    } catch (err) {
      logger.error(
        `revenueCatWebhook: idempotency lookup failed for ${eventId}:`,
        err.message
      );
    }
  }

  const finalise = async (fields) => {
    if (!dedupRef) return;
    try {
      await dedupRef.set({
        type: event.type || null,
        processedAt: serverTimestamp(),
        ...fields,
      });
    } catch (err) {
      logger.error(
        `revenueCatWebhook: dedup record write failed for ${eventId}:`,
        err.message
      );
    }
  };

  const mapped = mapRevenueCatEvent(event);
  if (mapped.action === "ignore") {
    await finalise({ result: `ignored:${mapped.reason}` });
    return { status: 200, result: `ignored:${mapped.reason}` };
  }

  const appUserId = event.app_user_id;
  // Identity slice binds App User ID === Firebase uid; an RC anonymous id
  // means the event predates login binding and cannot map to a profile.
  if (
    typeof appUserId !== "string" ||
    appUserId.length === 0 ||
    appUserId.startsWith("$RCAnonymousID:")
  ) {
    logger.warn(
      `revenueCatWebhook: unmappable app_user_id for event ${eventId}`
    );
    await finalise({ result: "unmappable-app-user-id" });
    return { status: 200, result: "unmappable-app-user-id" };
  }
  const uid = appUserId;

  // R1A-Deletion: system-writer guard — never resurrect a deleted user.
  if (!(await locks.shouldSystemWriteProceed(firestore, uid, "revenueCatWebhook"))) {
    await locks.recordPaymentEventPostDeletion(firestore, {
      provider: "revenuecat",
      externalTxnId:
        event.transaction_id || event.original_transaction_id || null,
      providerEventId: eventId,
      eventType: event.type,
      uid,
    });
    await finalise({ uid, result: "skipped_account_deleted" });
    return { status: 200, result: "skipped_account_deleted" };
  }

  const applied = await applyRevenueCatEntitlement({
    firestore,
    uid,
    tier: mapped.tier,
    expiresAtMs: mapped.expiresAtMs,
    logger,
  });
  await finalise({ uid, result: applied.result });
  return { status: 200, result: applied.result };
}


async function syncEntitlementFromRest({
  firestore,
  uid,
  restKey,
  fetchImpl = fetch,
  locks,
  logger = console,
}) {
  if (!(await locks.shouldSystemWriteProceed(firestore, uid, "syncRevenueCatEntitlement"))) {
    return { synced: false, reason: "account-deleted" };
  }

  const resp = await fetchImpl(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${restKey}` } }
  );
  if (!resp.ok) {
    logger.error(`syncRevenueCatEntitlement: RC REST ${resp.status} for uid=${uid}`);
    return { synced: false, reason: `rest-${resp.status}` };
  }
  const body = await resp.json();
  const pro = body?.subscriber?.entitlements?.pro;
  if (!pro) {
    // RC has no pro history for this user — nothing RC-authoritative to
    // write (covers the Stripe-web subscriber calling sync by accident).
    return { synced: false, reason: "no-rc-entitlement" };
  }

  const expiresMs = pro.expires_date ? Date.parse(pro.expires_date) : null;
  const active =
    typeof expiresMs === "number" && !Number.isNaN(expiresMs)
      ? expiresMs > Date.now()
      : true; // no expiry on the entitlement record ⇒ treat as active

  const applied = await applyRevenueCatEntitlement({
    firestore,
    uid,
    tier: active ? "pro" : "free",
    expiresAtMs: typeof expiresMs === "number" && !Number.isNaN(expiresMs) ? expiresMs : null,
    logger,
  });
  return { synced: applied.result === "applied", result: applied.result, isPro: active };
}


module.exports = {
  RC_EVENTS_COLLECTION,
  safeEqual,
  mapRevenueCatEvent,
  applyRevenueCatEntitlement,
  processRevenueCatEvent,
  syncEntitlementFromRest,
};

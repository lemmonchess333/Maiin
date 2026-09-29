/**
 * RevenueCat → user entitlement, the decisions without the I/O.
 *
 * ADR-0006 makes RevenueCat the entitlement source of truth for in-app
 * purchases: the `revenueCatWebhook` and the `syncRevenueCatEntitlement`
 * callable (functions/revenueCat.js) both fetch the subscriber from
 * RevenueCat's REST API and hand the response here. Deciding from that
 * snapshot, never from the webhook event's own fields, is what makes the
 * handlers safe to repeat and to run out of order: a duplicate delivery
 * re-reads the same truth, and an older snapshot never overwrites a newer
 * one (`syncedAtMs`, RevenueCat's own request time).
 *
 * Fields written to `users/{uid}`:
 *   - `subscriptionTier` / `subscriptionSource` / `subscriptionExpiresAt` —
 *     the shared contract every billing path writes, decided through
 *     `resolveSubscriptionUpdate` so this path cannot drift from the others.
 *   - `revenueCat` — a server-only map recording the last snapshot. It is how
 *     a later snapshot knows whether RevenueCat granted the Pro it may take
 *     away. Clients cannot write it: it is not in the rules allow-list.
 *
 * A sandbox purchase grants Pro only to the uids in REVENUECAT_SANDBOX_UIDS
 * (see getSandboxUidAllowlist); for anyone else it counts as no entitlement.
 *
 * Pinned by functions/__tests__/revenueCatEntitlement.test.js.
 */

const crypto = require("crypto");
const {
  resolveSubscriptionUpdate,
  SOURCE_IOS_IAP,
  SOURCE_ANDROID_IAP,
  SOURCE_STRIPE,
} = require("./subscriptionReconciliation");

/** The RevenueCat entitlement that means Pro (docs/iap/revenuecat-setup.md). */
const ENTITLEMENT_ID = "pro";

/**
 * RevenueCat store → the platform `subscriptionSource` the rest of the app
 * reads. Stores missing here (promotional grants, Amazon, Paddle) are
 * recorded but never change the tier: none of them is a platform the app
 * knows how to manage, and a comp is granted in Firestore directly.
 */
const STORE_SOURCES = Object.freeze({
  app_store: SOURCE_IOS_IAP,
  mac_app_store: SOURCE_IOS_IAP,
  play_store: SOURCE_ANDROID_IAP,
  stripe: SOURCE_STRIPE,
  rc_billing: SOURCE_STRIPE,
});

class RevenueCatResponseError extends Error {}

/**
 * The uids whose sandbox purchases grant Pro: the owner's account and App
 * Review's demo login. A sandbox purchase (TestFlight, StoreKit testing, a
 * Play licence tester) costs nothing, and anyone with a test build can attach
 * one to any App User ID through the public SDK key, so it must never be Pro
 * by default.
 *
 * Provisioned like ADMIN_UIDS (functions/adminAuth.js): a plain environment
 * variable, not a secret, so no Secret Manager binding. Comma-separated,
 * whitespace tolerant:
 *
 *   # functions/.env
 *   REVENUECAT_SANDBOX_UIDS=uid1,uid2
 *
 * Both revenueCatWebhook and syncRevenueCatEntitlement read it, so both
 * functions need it. Read on every call, never at module load. Unset or
 * empty means no sandbox purchase grants Pro to anyone.
 */
function getSandboxUidAllowlist() {
  const raw = process.env.REVENUECAT_SANDBOX_UIDS || "";
  const list = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(list);
}

/** Whether this uid's sandbox purchases grant Pro. False for an empty list
 *  and for anything that is not a non-empty string. */
function isSandboxAllowedUid(uid) {
  if (typeof uid !== "string" || !uid) return false;
  return getSandboxUidAllowlist().has(uid);
}

function parseDateMs(value, field) {
  if (value === null) return null;
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) {
    throw new RevenueCatResponseError(`unreadable ${field}`);
  }
  return ms;
}

/** The purchase record behind an entitlement: a subscription, else the
 *  latest one-time purchase of that product. */
function purchaseFor(subscriber, productId) {
  const subscription = subscriber.subscriptions && subscriber.subscriptions[productId];
  if (subscription && typeof subscription === "object") return subscription;
  const oneTime = subscriber.non_subscriptions && subscriber.non_subscriptions[productId];
  if (Array.isArray(oneTime) && oneTime.length > 0) return oneTime[oneTime.length - 1];
  return null;
}

/**
 * Read the `pro` entitlement out of a `GET /v1/subscribers/{id}` response.
 *
 * Active means non-expiring (`expires_date: null`), or expiring after the
 * snapshot was taken. A billing-issue grace period counts: RevenueCat keeps
 * the entitlement until `grace_period_expires_date`, so the effective expiry
 * is the later of the two. Refunds and revocations arrive as an expiry in
 * the past, so they read as inactive with no special case.
 *
 * `active` reads the expiry only. Whether a sandbox purchase counts depends
 * on whose it is, which planEntitlementWrite decides. A purchase is read as
 * production only when RevenueCat says so (`is_sandbox: false`), so a
 * missing or malformed flag cannot pass a free purchase off as a paid one.
 *
 * Throws RevenueCatResponseError on a response it cannot read rather than
 * guessing at an entitlement.
 */
function readEntitlement(response) {
  if (!response || typeof response !== "object") {
    throw new RevenueCatResponseError("response is not an object");
  }
  const syncedAtMs = Number(response.request_date_ms);
  const subscriber = response.subscriber;
  if (!Number.isFinite(syncedAtMs) || syncedAtMs <= 0 || !subscriber || typeof subscriber !== "object") {
    throw new RevenueCatResponseError("missing request_date_ms or subscriber");
  }
  const entitlement = subscriber.entitlements && subscriber.entitlements[ENTITLEMENT_ID];
  if (!entitlement || typeof entitlement !== "object") {
    return { present: false, active: false, expiresAtMs: null, productId: null, store: null, sandbox: false, syncedAtMs };
  }
  if (!("expires_date" in entitlement)) {
    throw new RevenueCatResponseError("entitlement has no expires_date");
  }
  const expiresMs = parseDateMs(entitlement.expires_date, "expires_date");
  const graceMs =
    entitlement.grace_period_expires_date == null
      ? null
      : parseDateMs(entitlement.grace_period_expires_date, "grace_period_expires_date");
  const expiresAtMs = expiresMs === null ? null : Math.max(expiresMs, graceMs ?? expiresMs);
  const productId = typeof entitlement.product_identifier === "string" ? entitlement.product_identifier : null;
  const purchase = productId ? purchaseFor(subscriber, productId) : null;
  return {
    present: true,
    active: expiresAtMs === null || expiresAtMs > syncedAtMs,
    expiresAtMs,
    productId,
    store: purchase && typeof purchase.store === "string" ? purchase.store : null,
    sandbox: Boolean(purchase) && purchase.is_sandbox !== false,
    syncedAtMs,
  };
}

/** True when the stored Pro is the Pro RevenueCat granted last. Another
 *  billing path writing since (a different source) makes it not ours. */
function revenueCatOwnsPro(userData) {
  const stored = userData.revenueCat;
  return (
    userData.subscriptionTier === "pro" &&
    !!stored &&
    stored.entitlementActive === true &&
    typeof stored.store === "string" &&
    STORE_SOURCES[stored.store] !== undefined &&
    STORE_SOURCES[stored.store] === userData.subscriptionSource
  );
}

/**
 * Decide the merge-write for one user from one entitlement snapshot.
 *
 * `sandboxAllowed` is whether this user's sandbox purchases count
 * (isSandboxAllowedUid). Anything but `true` refuses them.
 *
 * Returns `{ write, result, conflict?, conflictReason?, sandboxRefused? }`.
 * `write` is the merge payload (null for nothing to write). `result` is a
 * fixed code for logs and the webhook's event record:
 *   granted | revoked | stale | lifetime | unsupported-store | not-ours
 * `sandboxRefused` is true when an unexpired sandbox purchase did not count.
 */
function planEntitlementWrite(userData, entitlement, { sandboxAllowed = false } = {}) {
  const stored = userData.revenueCat;
  if (stored && Number(stored.syncedAtMs) > entitlement.syncedAtMs) {
    return { write: null, result: "stale" };
  }
  // A refused sandbox purchase counts as no entitlement. It grants nothing,
  // and like a lapse it takes away only Pro that RevenueCat granted, so a
  // tester taken off the list loses the Pro a sandbox purchase gave them,
  // while Pro from Stripe, a lifetime purchase or the legacy Apple path stays.
  const sandboxRefused =
    entitlement.active && entitlement.sandbox && sandboxAllowed !== true;
  const active = entitlement.active && !sandboxRefused;
  const refused = sandboxRefused ? { sandboxRefused: true } : {};
  const expiresAt =
    entitlement.expiresAtMs === null ? null : new Date(entitlement.expiresAtMs).toISOString();
  const record = {
    entitlementActive: active,
    productId: entitlement.productId,
    store: entitlement.store,
    expiresAt,
    sandbox: entitlement.sandbox,
    syncedAtMs: entitlement.syncedAtMs,
  };

  // A lifetime purchase is never touched by a subscription snapshot, the
  // same protection applySubscriptionToUser gives it.
  if (userData.planKind === "lifetime") {
    return { write: { revenueCat: record }, result: "lifetime", ...refused };
  }

  if (active) {
    const source = entitlement.store ? STORE_SOURCES[entitlement.store] : undefined;
    if (!source) {
      return { write: { revenueCat: record }, result: "unsupported-store" };
    }
    const { writeTier, writeSource, conflict, conflictReason } = resolveSubscriptionUpdate({
      currentTier: userData.subscriptionTier,
      currentSource: userData.subscriptionSource,
      incomingTier: "pro",
      incomingSource: source,
    });
    return {
      write: {
        subscriptionTier: writeTier,
        subscriptionSource: writeSource,
        subscriptionExpiresAt: expiresAt,
        revenueCat: record,
      },
      result: "granted",
      conflict,
      conflictReason,
    };
  }

  // Inactive. Take away only Pro that RevenueCat itself gave: Pro from
  // Stripe, from the legacy Apple path or granted by hand stays.
  if (!revenueCatOwnsPro(userData)) {
    return { write: { revenueCat: record }, result: "not-ours", ...refused };
  }
  const { writeTier, writeSource } = resolveSubscriptionUpdate({
    currentTier: userData.subscriptionTier,
    currentSource: userData.subscriptionSource,
    incomingTier: "free",
    incomingSource: userData.subscriptionSource,
  });
  return {
    write: {
      subscriptionTier: writeTier,
      subscriptionSource: writeSource,
      // A refused purchase's expiry is not this user's to keep, so none is
      // written, as when the entitlement is gone altogether.
      subscriptionExpiresAt: sandboxRefused ? null : expiresAt,
      revenueCat: record,
    },
    result: "revoked",
    ...refused,
  };
}

/**
 * Whether an App User ID can be a Firebase uid (ADR-0006: App User ID ===
 * uid). Anonymous RevenueCat ids and anything that is not a valid
 * Firestore document id are refused before any read.
 */
function isAppUserUid(id) {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 128 &&
    !id.startsWith("$RCAnonymousID:") &&
    !id.includes("/") &&
    id !== "." &&
    id !== ".." &&
    !/^__.*__$/.test(id)
  );
}

/** The users one webhook event can change. A TRANSFER moves the purchase
 *  between App User IDs, so both sides are re-read. */
function uidsForEvent(event) {
  const ids =
    event.type === "TRANSFER"
      ? [
          ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
          ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
        ]
      : [event.app_user_id];
  return [...new Set(ids.filter(isAppUserUid))];
}

/**
 * Constant-time check of the webhook's Authorization header against the
 * configured secret. RevenueCat sends the header value exactly as set in
 * its dashboard, so both the bare secret and `Bearer <secret>` are
 * accepted. An empty or missing secret refuses everything: an
 * unprovisioned secret must not open the endpoint.
 */
function isAuthorized(header, secret) {
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof header !== "string" || header.length === 0) return false;
  const digest = (value) => crypto.createHash("sha256").update(value).digest();
  const given = digest(header);
  let match = false;
  for (const expected of [secret, `Bearer ${secret}`]) {
    match = crypto.timingSafeEqual(given, digest(expected)) || match;
  }
  return match;
}

module.exports = {
  ENTITLEMENT_ID,
  STORE_SOURCES,
  RevenueCatResponseError,
  getSandboxUidAllowlist,
  isSandboxAllowedUid,
  readEntitlement,
  planEntitlementWrite,
  revenueCatOwnsPro,
  isAppUserUid,
  uidsForEvent,
  isAuthorized,
};

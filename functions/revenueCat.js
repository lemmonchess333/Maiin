// RevenueCat server side (ADR-0006, IAP slice 3 backend).
//
// The client's RevenueCat purchase path (src/lib/purchaseProvider.ts) calls
// `syncRevenueCatEntitlement` straight after a purchase and relies on
// `revenueCatWebhook` for everything after it: renewals, cancellations,
// expiry, refunds, billing grace, product changes, transfers. Both do the
// same thing: fetch the subscriber from RevenueCat's REST API and write what
// it says (decided in lib/revenueCatEntitlement.js). Neither trusts the
// event body for an entitlement, so a replayed or reordered delivery cannot
// grant or remove Pro on its own say-so. Both go through syncUser, which is
// where a sandbox purchase is held to REVENUECAT_SANDBOX_UIDS.
//
// 1st-gen triggers, like every export here: firebase-functions/v1.
const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const accountDeletionLocks = require("./lib/accountDeletionLocks");
const rateLimiter = require("./rateLimiter");
const entitlement = require("./lib/revenueCatEntitlement");
const { readReportedPrice } = require("./lib/trialReminder");

// Secret Manager bindings (docs/iap/revenuecat-setup.md, Part C). A deploy
// that binds an unprovisioned secret fails, so both must exist before this
// file reaches main:
//   firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
//   firebase functions:secrets:set REVENUECAT_REST_KEY
const REVENUECAT_WEBHOOK_AUTH = defineSecret("REVENUECAT_WEBHOOK_AUTH");
const REVENUECAT_REST_KEY = defineSecret("REVENUECAT_REST_KEY");

// The DEFAULT_HTTP_CAP tier from index.js. CLAUDE.md makes a cap mandatory
// on every HTTP function; triggerMetadata.test.js pins this value.
const REVENUECAT_CAP = { maxInstances: 100 };

const SUBSCRIBERS_API = "https://api.revenuecat.com/v1/subscribers/";
const REST_TIMEOUT_MS = 10_000;

// Callers of the sync: the client calls once per purchase, so ten in ten
// minutes is an abuse bound, not a pacing rule.
const SYNC_RATE_LIMIT = {
  action: "revenueCatSync",
  maxCalls: 10,
  windowMs: 600_000,
};

/** A failure to read RevenueCat. `code` is fixed text, never a response body. */
class RevenueCatUnavailable extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** GET /v1/subscribers/{uid}. Throws RevenueCatUnavailable on any failure. */
async function fetchSubscriber(uid, { apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new RevenueCatUnavailable("rest-key-missing");
  let response;
  try {
    response = await fetchImpl(SUBSCRIBERS_API + encodeURIComponent(uid), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch {
    throw new RevenueCatUnavailable("network");
  }
  if (!response.ok) throw new RevenueCatUnavailable(`http-${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new RevenueCatUnavailable("invalid-json");
  }
}

/**
 * Re-read one user's entitlement from RevenueCat and write it.
 *
 * Never creates a user document: an App User ID with no `users/{uid}` is
 * reported as `no-user` before RevenueCat is called. The write runs in a
 * transaction so the staleness check and the write see the same document.
 *
 * A sandbox purchase counts only when the uid is on REVENUECAT_SANDBOX_UIDS.
 * The webhook and the callable both reach the plan through here, so the
 * list is checked in one place for both.
 *
 * `reportedPrice` is the price the app sold the plan at, from the callable
 * only (readReportedPrice has checked it). RevenueCat does not hold a
 * trial's renewal price, and the trial reminder's email names it.
 */
async function syncUser({
  db,
  uid,
  apiKey,
  fetchImpl,
  serverTimestamp,
  logger,
  reportedPrice = null,
}) {
  const userRef = db.collection("users").doc(uid);
  if (!(await userRef.get()).exists) return { uid, result: "no-user" };

  const snapshot = entitlement.readEntitlement(
    await fetchSubscriber(uid, { apiKey, fetchImpl })
  );
  const sandboxAllowed = entitlement.isSandboxAllowedUid(uid);

  const outcome = await db.runTransaction(async (txn) => {
    const userSnap = await txn.get(userRef);
    if (!userSnap.exists) return { result: "no-user" };
    const userData = userSnap.data() || {};
    const plan = entitlement.planEntitlementWrite(userData, snapshot, {
      sandboxAllowed,
      reportedPrice,
    });
    if (plan.write) {
      txn.set(
        userRef,
        { ...plan.write, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
    const after = { ...userData, ...(plan.write || {}) };
    return {
      result: plan.result,
      conflict: plan.conflict,
      conflictReason: plan.conflictReason,
      sandboxRefused: plan.sandboxRefused === true,
      tier: after.subscriptionTier || "free",
      expiresAt: after.subscriptionExpiresAt || null,
    };
  });

  if (outcome.sandboxRefused) {
    // A TestFlight tester who is not on the list, or someone attaching a
    // free purchase to this App User ID. The uid is enough to follow it up,
    // so no transaction or receipt id is logged.
    logger.warn("revenueCat.sandbox_refused", {
      uid,
      store: snapshot.store,
      productId: snapshot.productId,
      result: outcome.result,
    });
  }
  if (outcome.conflict) {
    // Same forensic breadcrumb as the Apple path. No automatic Stripe
    // cancel: Stripe is dormant (Sub4) and this path has no Stripe key.
    logger.warn("revenueCat.cross_platform_conflict", {
      uid,
      conflictReason: outcome.conflictReason,
    });
  }
  return { uid, ...outcome };
}

/** The webhook, with its dependencies injected so it can be tested whole. */
async function handleWebhook(req, res, deps) {
  const { db, webhookAuth, apiKey, fetchImpl, serverTimestamp, logger } = deps;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const header = req.headers && req.headers.authorization;
  if (!entitlement.isAuthorized(header, webhookAuth)) {
    logger.warn(
      "revenueCatWebhook: refused a request with a missing or wrong Authorization header"
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const event = req.body && req.body.event;
  if (!event || typeof event !== "object" || typeof event.type !== "string") {
    res.status(400).json({ error: "Missing event" });
    return;
  }
  // The dashboard's "send test event" uses a made-up App User ID.
  if (event.type === "TEST") {
    res.status(200).json({ ok: true });
    return;
  }

  // Replays are harmless (every sync re-reads RevenueCat), but a delivery
  // already processed skips the REST calls. Recorded after success, like
  // appleNotifications, so a delivery that failed part-way is retried
  // rather than hidden. The record holds no uid.
  const eventId =
    typeof event.id === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(event.id)
      ? event.id
      : null;
  const eventRef = eventId
    ? db.collection("revenueCatEvents").doc(eventId)
    : null;
  if (eventRef) {
    try {
      if ((await eventRef.get()).exists) {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
    } catch (err) {
      logger.error("revenueCatWebhook: event lookup failed", {
        eventId,
        error: err.message,
      });
    }
  }

  try {
    const results = [];
    for (const uid of entitlement.uidsForEvent(event)) {
      // A deleting or deleted account gets no new writes. Log a minimised
      // record for operator review, as the Apple and Stripe webhooks do.
      if (
        !(await accountDeletionLocks.shouldSystemWriteProceed(
          db,
          uid,
          "revenueCatWebhook"
        ))
      ) {
        await accountDeletionLocks.recordPaymentEventPostDeletion(db, {
          provider: "revenuecat",
          externalTxnId:
            typeof event.original_transaction_id === "string"
              ? event.original_transaction_id
              : null,
          providerEventId: eventId,
          eventType: event.type,
          uid,
        });
        results.push("skipped-account-deleted");
        continue;
      }
      const synced = await syncUser({
        db,
        uid,
        apiKey,
        fetchImpl,
        serverTimestamp,
        logger,
      });
      logger.log(
        `revenueCatWebhook: ${event.type} for uid=${uid}: ${synced.result}`
      );
      results.push(synced.result);
    }
    if (eventRef) {
      await eventRef
        .set({ type: event.type, results, processedAt: serverTimestamp() })
        .catch((err) =>
          logger.error("revenueCatWebhook: event record failed", {
            eventId,
            error: err.message,
          })
        );
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    // A non-200 makes RevenueCat retry the delivery, which re-reads the
    // subscriber from scratch.
    logger.error("revenueCatWebhook: sync failed", {
      eventId,
      type: event.type,
      error: err instanceof RevenueCatUnavailable ? err.code : err.message,
    });
    res.status(500).json({ error: "Sync failed" });
  }
}

/** The callable, with its dependencies injected so it can be tested whole.
 *  `data.price` is the price the app showed for the plan it just sold
 *  (`{ productId, amount, currencyCode, display }`); anything else in
 *  `data` is ignored, and a price that does not pass readReportedPrice is
 *  dropped rather than refused, so it can never fail a purchase. */
async function handleSync(context, deps, data = {}) {
  const { db, apiKey, fetchImpl, serverTimestamp, logger } = deps;
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Sign in to update your subscription."
    );
  }
  const uid = context.auth.uid;
  // Deletion lock first, then the limiter: the limiter writes
  // rateLimits/{uid}_…, and a deleting account gets no new writes.
  await accountDeletionLocks.assertCallableActorNotDeleting(db, uid);
  if (
    await rateLimiter.isRateLimited(
      db,
      uid,
      SYNC_RATE_LIMIT.action,
      SYNC_RATE_LIMIT.maxCalls,
      SYNC_RATE_LIMIT.windowMs
    )
  ) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Too many subscription checks. Try again in a few minutes."
    );
  }
  try {
    const synced = await syncUser({
      db,
      uid,
      apiKey,
      fetchImpl,
      serverTimestamp,
      logger,
      reportedPrice: readReportedPrice(data && data.price),
    });
    return {
      result: synced.result,
      tier: synced.tier || "free",
      expiresAt: synced.expiresAt || null,
    };
  } catch (err) {
    logger.warn("syncRevenueCatEntitlement: sync failed", {
      uid,
      error: err instanceof RevenueCatUnavailable ? err.code : err.message,
    });
    // The client tolerates this: the webhook lands the same write shortly.
    throw new functions.https.HttpsError(
      "unavailable",
      "Couldn't confirm the purchase yet. Pro will switch on shortly."
    );
  }
}

function productionDeps() {
  return {
    db: admin.firestore(),
    webhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH,
    apiKey: process.env.REVENUECAT_REST_KEY,
    fetchImpl: fetch,
    serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    logger: functions.logger,
  };
}

// RevenueCat → Project → Integrations → Webhooks, with the Authorization
// header set to REVENUECAT_WEBHOOK_AUTH.
exports.revenueCatWebhook = functions
  // ⛔ NEVER add `enforceAppCheck: true` here. RevenueCat's servers call this
  // and cannot send an App Check token; the Authorization header is the
  // auth. See docs/app-check-rollout.md → "Never enforce".
  .runWith({
    ...REVENUECAT_CAP,
    secrets: [REVENUECAT_WEBHOOK_AUTH, REVENUECAT_REST_KEY],
  })
  .https.onRequest((req, res) => handleWebhook(req, res, productionDeps()));

// Called by the client straight after a RevenueCat purchase
// (purchaseProvider.ts syncEntitlementBestEffort).
exports.syncRevenueCatEntitlement = functions
  .runWith({ ...REVENUECAT_CAP, secrets: [REVENUECAT_REST_KEY] })
  .https.onCall((data, context) => handleSync(context, productionDeps(), data));

// The trial reminder's sweep re-reads RevenueCat through the same path
// before it emails anyone (trialReminders.js).
exports.syncUser = syncUser;
exports.RevenueCatUnavailable = RevenueCatUnavailable;

exports._internals = {
  REVENUECAT_CAP,
  SUBSCRIBERS_API,
  SYNC_RATE_LIMIT,
  RevenueCatUnavailable,
  fetchSubscriber,
  syncUser,
  handleWebhook,
  handleSync,
};

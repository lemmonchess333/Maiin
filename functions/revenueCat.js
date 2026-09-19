/**
 * RevenueCat entitlement pipeline — IAP slice 3, per ADR-0006.
 *
 * Two entry points, one write path:
 *
 *   revenueCatWebhook        RevenueCat → us, on every subscription
 *                            lifecycle change. The server-side source of
 *                            truth for renewals, cancellations, refunds
 *                            and anything that happens while the app is
 *                            closed.
 *   syncRevenueCatEntitlement  the client → us, immediately after a
 *                            purchase or restore resolves. ADR-0006
 *                            decision 4: customerInfo updates instantly
 *                            and the webhook trails it by seconds, so an
 *                            AI scan in that window would hit a server
 *                            still reading `free`. This closes the gap.
 *
 * Both resolve the same way — ask RevenueCat what is true for this
 * app_user_id, then write it — so there is exactly one place where
 * entitlement state is decided and the two paths cannot drift.
 *
 * Until this shipped, `purchaseProvider.ts` called
 * `syncRevenueCatEntitlement` and swallowed the failure behind a comment
 * reading "tolerated: webhook is the source of truth", and no webhook
 * existed. With `VITE_REVENUECAT_IOS_KEY` set, that path took the money
 * and granted nothing.
 *
 * IDENTITY. RevenueCat's App User ID is the Firebase uid (ADR-0006
 * decision 3, wired in src/hooks/useRevenueCatIdentity.ts). That is the
 * whole of the mapping — there is no lookup index like the Apple path's
 * appleSubscriptions/{originalTransactionId}, and nothing here writes
 * one. Purchaser binding is RevenueCat's transfer-behaviour setting, not
 * ours.
 */
"use strict";

const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

const accountDeletionLocks = require("./lib/accountDeletionLocks");
const { isRateLimited } = require("./rateLimiter");
const {
  resolveSubscriptionUpdate,
} = require("./lib/subscriptionReconciliation");
const {
  constantTimeEquals,
  parseWebhookEnvelope,
  entitlementFromSubscriber,
  sourceForEntitlement,
} = require("./lib/revenueCatEntitlement");

const REVENUECAT_WEBHOOK_AUTH = defineSecret("REVENUECAT_WEBHOOK_AUTH");
const REVENUECAT_REST_KEY = defineSecret("REVENUECAT_REST_KEY");

const REVENUECAT_CAP = { maxInstances: 100 };

const RC_API_BASE = "https://api.revenuecat.com/v1";

/** Ceiling on the REST call. A webhook that hangs holds an instance and
 *  RevenueCat has already started its own retry clock; failing fast and
 *  letting the retry land is better than both. */
const RC_FETCH_TIMEOUT_MS = 10_000;

/**
 * Ask RevenueCat for the current subscriber state.
 *
 * Throws on anything that is not a clean 200 — including 404, which for
 * this endpoint means RevenueCat has never seen the id. That is not the
 * same as "no entitlement": treating it as a downgrade would let a
 * typo'd id or a project misconfiguration silently strip Pro from a
 * paying user, so it fails and retries instead.
 */
async function fetchSubscriber(appUserId, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RC_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error(
        `RevenueCat subscriber lookup failed: ${response.status}`
      );
    }
    const body = await response.json();
    if (!body || typeof body.subscriber !== "object" || !body.subscriber) {
      throw new Error("RevenueCat subscriber lookup returned no subscriber");
    }
    return body.subscriber;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Write the resolved entitlement onto users/{uid}.
 *
 * Takes its firestore and clock by injection so the decisions below are
 * testable without an emulator (same shape as applySubscriptionToUser).
 *
 * NOT DONE HERE, deliberately:
 *
 *   - No staleness guard. The Apple path needs one because it writes the
 *     expiry carried on the notification, and Apple delivers out of
 *     order. This writes whatever RevenueCat says is true at fetch time,
 *     so a late event re-reads current state and computes the same bytes
 *     — see the header of lib/revenueCatEntitlement.js.
 *   - No displaced-Stripe auto-cancel. The Apple path cancels a Stripe
 *     subscription it overrides. ADR-0006 gates Stripe off for v1 and
 *     retires it later, and adding a third pipeline that can cancel
 *     billing is a larger commitment than this slice should make. The
 *     conflict is logged for operator follow-up, which is what the
 *     inverse direction has always done.
 *   - No appleOriginalTransactionId / appleProductId. Those belong to the
 *     hand-rolled path ADR-0006 retires. Writing them from here would
 *     bind a RevenueCat entitlement into the legacy uniqueness index and
 *     make the two paths fight over the same rows.
 */
async function applyRevenueCatEntitlement({
  firestore,
  uid,
  entitlement,
  serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp(),
  logger = console,
}) {
  const userRef = firestore.collection("users").doc(uid);

  return firestore.runTransaction(async (txn) => {
    const userSnap = await txn.get(userRef);
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    // Lifetime protection, mirroring applySubscriptionToUser: a
    // subscription event can never downgrade a one-time purchase.
    if (userData.planKind === "lifetime") {
      logger.log(
        `applyRevenueCatEntitlement: skipping for uid=${uid} — lifetime entitlement`
      );
      return {
        tier: userData.subscriptionTier || "pro",
        expiresAt: userData.subscriptionExpiresAt || null,
        skipped: "lifetime",
      };
    }

    const { writeTier, writeSource, conflict, conflictReason } =
      resolveSubscriptionUpdate({
        currentTier: userData.subscriptionTier,
        currentSource: userData.subscriptionSource,
        incomingTier: entitlement.isActive ? "pro" : "free",
        incomingSource: sourceForEntitlement(entitlement),
      });

    txn.set(
      userRef,
      {
        subscriptionTier: writeTier,
        subscriptionSource: writeSource,
        subscriptionExpiresAt: entitlement.isActive
          ? entitlement.expiresAt
          : null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (conflict) {
      logger.warn("applyRevenueCatEntitlement.cross_platform_conflict", {
        uid,
        conflictReason,
        newSource: writeSource,
        previousSource: userData.subscriptionSource,
      });
    }

    return {
      tier: writeTier,
      expiresAt: entitlement.isActive ? entitlement.expiresAt : null,
      crossPlatformConflict: conflict,
    };
  });
}

/** Resolve + write for one uid. Shared by both entry points. */
async function syncEntitlementForUid({ firestore, uid, apiKey, logger }) {
  const subscriber = await fetchSubscriber(uid, apiKey);
  const entitlement = entitlementFromSubscriber(subscriber);
  const applied = await applyRevenueCatEntitlement({
    firestore,
    uid,
    entitlement,
    logger,
  });
  return { entitlement, applied };
}

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

exports.revenueCatWebhook = functions
  // ⛔ NEVER add `enforceAppCheck: true` here. This is an EXTERNAL webhook —
  // RevenueCat's servers call it and cannot send a Firebase App Check token,
  // so enforcement would 403 every event and silently freeze entitlement
  // state at whatever it was. Auth is the shared Authorization header below
  // (ADR-0006, "the RC webhook is not an App Check surface").
  // See docs/app-check-rollout.md → "Never enforce".
  .runWith({
    ...REVENUECAT_CAP,
    secrets: [REVENUECAT_WEBHOOK_AUTH, REVENUECAT_REST_KEY],
  })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH;
    const apiKey = process.env.REVENUECAT_REST_KEY;
    if (!expectedAuth || !apiKey) {
      console.error("revenueCatWebhook: secrets not configured");
      res.status(500).json({ error: "Webhook not configured" });
      return;
    }

    // Constant-time compare. An unauthenticated caller gets 401 with no
    // detail — not 400 — so a probe cannot distinguish "wrong secret"
    // from "malformed body" and map the endpoint's validation order.
    if (!constantTimeEquals(req.get("Authorization") || "", expectedAuth)) {
      console.warn("revenueCatWebhook: rejected unauthenticated delivery");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const envelope = parseWebhookEnvelope(req.body);
    if (!envelope) {
      res.status(400).json({ error: "Malformed event" });
      return;
    }
    const { eventId, appUserId, type, store } = envelope;

    const db = admin.firestore();
    const eventRef = db.collection("revenueCatEvents").doc(eventId);

    // Idempotency, in stripeWebhook's shape rather than
    // appleIAPWebhook's: claim inside a transaction, and DELETE the
    // claim if processing throws. The transactional claim is what stops
    // two concurrent re-deliveries both passing an exists check; the
    // compensating delete is what stops a crash mid-processing from
    // making the event invisible to every retry. Apple's handler can
    // use the get-then-set shape because it records only after success
    // — take one half of either pattern and you get a bug.
    let isDuplicate = false;
    try {
      await db.runTransaction(async (txn) => {
        const snap = await txn.get(eventRef);
        if (snap.exists) {
          isDuplicate = true;
          return;
        }
        txn.set(eventRef, {
          type,
          appUserId,
          store: store || null,
          claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (err) {
      console.error(
        `revenueCatWebhook: idempotency claim failed for ${eventId}:`,
        err.message
      );
      res
        .status(500)
        .json({ error: "Idempotency claim failed; retrying recommended" });
      return;
    }

    if (isDuplicate) {
      console.log(
        `revenueCatWebhook: duplicate delivery for ${eventId}, skipping`
      );
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    try {
      // The App User ID is the Firebase uid, but this endpoint is
      // authenticated by a shared secret, so the id on the wire is only
      // as trustworthy as that secret. Requiring the user doc to already
      // exist keeps a leaked secret from conjuring `users/{anything}`
      // via the merge-set below — and a real event for an id we have
      // never seen is an operator problem, not a write.
      const userSnap = await db.collection("users").doc(appUserId).get();
      if (!userSnap.exists) {
        console.warn(
          `revenueCatWebhook: no user for app_user_id=${appUserId} type=${type}`
        );
        await eventRef.set(
          {
            result: "no-user-match",
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        res.status(200).json({ received: true });
        return;
      }

      // R1A-Deletion system-writer guard. A billing event for an account
      // mid-deletion or tombstoned must not resurrect the user doc; log
      // a minimised record for operator review and stop retries with a
      // 200.
      if (
        !(await accountDeletionLocks.shouldSystemWriteProceed(
          db,
          appUserId,
          "revenueCatWebhook"
        ))
      ) {
        await accountDeletionLocks.recordPaymentEventPostDeletion(db, {
          provider: "revenuecat",
          externalTxnId: appUserId,
          providerEventId: eventId,
          eventType: type,
          uid: appUserId,
        });
        await eventRef.set(
          {
            result: "skipped_account_deleted",
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        res.status(200).json({ received: true });
        return;
      }

      const { entitlement, applied } = await syncEntitlementForUid({
        firestore: db,
        uid: appUserId,
        apiKey,
      });

      await eventRef.set(
        {
          result: applied.skipped || "applied",
          tier: applied.tier,
          entitlementActive: entitlement.isActive,
          resolvedStore: entitlement.store || null,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(
        `revenueCatWebhook: ${type} applied for uid=${appUserId} (${applied.skipped || applied.tier})`
      );
      res.status(200).json({ received: true });
    } catch (err) {
      // Release the claim so RevenueCat's retry reprocesses rather than
      // seeing a claim for work that never happened.
      try {
        await eventRef.delete();
      } catch (cleanupErr) {
        console.error(
          `revenueCatWebhook: failed to release claim ${eventId}:`,
          cleanupErr.message
        );
      }
      console.error(`revenueCatWebhook: error on ${eventId}`, err);
      res.status(500).json({ error: "Processing failed" });
    }
  });

/* ------------------------------------------------------------------ */
/* Sync-on-purchase callable                                           */
/* ------------------------------------------------------------------ */

exports.syncRevenueCatEntitlement = functions
  .runWith({ ...REVENUECAT_CAP, secrets: [REVENUECAT_REST_KEY] })
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    const apiKey = process.env.REVENUECAT_REST_KEY;
    if (!apiKey) {
      console.error("syncRevenueCatEntitlement: REVENUECAT_REST_KEY unset");
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Entitlement sync is not configured."
      );
    }

    const db = admin.firestore();
    await accountDeletionLocks.assertCallableActorNotDeleting(db, uid);

    // The caller is a purchase or restore completing, so the honest
    // ceiling is "a few per minute under a user retrying", not one. It
    // exists because each call reaches a third-party API on the user's
    // say-so; the webhook is the backstop if a call is refused, and the
    // client already treats this as best-effort.
    if (await isRateLimited(db, uid, "syncRevenueCatEntitlement", 10, 60_000)) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many sync attempts. Try again shortly."
      );
    }

    try {
      const { applied } = await syncEntitlementForUid({
        firestore: db,
        uid,
        apiKey,
      });
      return { tier: applied.tier, expiresAt: applied.expiresAt };
    } catch (err) {
      console.error(`syncRevenueCatEntitlement: failed for uid=${uid}`, err);
      // The webhook lands the same write within seconds, so this is a
      // latency failure rather than an entitlement failure. `internal`
      // keeps the third party's status codes off the client.
      throw new functions.https.HttpsError(
        "internal",
        "Could not sync entitlement."
      );
    }
  });

// Exported for tests — the transaction body is where every guard lives.
exports._applyRevenueCatEntitlement = applyRevenueCatEntitlement;
exports._fetchSubscriber = fetchSubscriber;

// firebase-functions v6+ repointed the bare import at the 2nd-gen API.
// Every trigger here (runWith().https.onCall/onRequest, HttpsError) is
// 1st-gen, which now lives under /v1 — same convention as appleIAP.js.
const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

// R1A-Deletion Chunk 2 — same lock helpers the Apple webhook uses. A
// payment event for a mid-deletion / tombstoned uid must NEVER recreate
// the user doc; it goes to paymentEventsPostDeletion for operator review.
const accountDeletionLocks = require("./lib/accountDeletionLocks");
const core = require("./lib/revenueCatCore");

/**
 * RevenueCat webhook + sync-on-purchase callable — IAP slice 3 backend
 * (#1099 / EPIC #1096, ADR-0006). All pipeline logic + invariants live in
 * lib/revenueCatCore.js (unit-tested with stubs); this file owns the
 * trigger surface: secrets binding, constant-time auth, admin wiring.
 *
 * The webhook is the entitlement source of truth on the RC path: RC has
 * already verified the transaction with Apple before it fires, so unlike
 * appleIAP.js there is no JWS/receipt verification here — the trust
 * anchor is the shared `Authorization` header secret (setup doc Part B7).
 */

const REVENUECAT_WEBHOOK_AUTH = defineSecret("REVENUECAT_WEBHOOK_AUTH");
const REVENUECAT_REST_KEY = defineSecret("REVENUECAT_REST_KEY");

// CLAUDE.md mandates maxInstances on every HTTP surface (cost-runaway cap).
const RC_CAP = { maxInstances: 100 };

exports.revenueCatWebhook = functions
  .runWith({ ...RC_CAP, secrets: [REVENUECAT_WEBHOOK_AUTH] })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method not allowed" });
      return;
    }
    // Trust anchor: the shared Authorization secret (setup doc B7). RC
    // sends it verbatim on every delivery.
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    const provided = req.get("Authorization") || "";
    if (!expected || !core.safeEqual(provided, expected)) {
      console.warn("revenueCatWebhook: rejected delivery (bad auth header)");
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const event = req.body && req.body.event;
      const outcome = await core.processRevenueCatEvent({
        firestore: admin.firestore(),
        event,
        locks: accountDeletionLocks,
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      });
      res
        .status(outcome.status)
        .json({ ok: outcome.status === 200, result: outcome.result });
    } catch (err) {
      console.error("revenueCatWebhook: processing failed:", err);
      // 5xx → RC retries with backoff; dedup makes the retry safe.
      res.status(500).json({ error: "internal" });
    }
  });

exports.syncRevenueCatEntitlement = functions
  .runWith({ ...RC_CAP, secrets: [REVENUECAT_REST_KEY] })
  .https.onCall(async (_data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign in to sync your subscription."
      );
    }
    try {
      return await core.syncEntitlementFromRest({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        restKey: process.env.REVENUECAT_REST_KEY,
        locks: accountDeletionLocks,
      });
    } catch (err) {
      console.error("syncRevenueCatEntitlement failed:", err);
      throw new functions.https.HttpsError("internal", "Sync failed.");
    }
  });

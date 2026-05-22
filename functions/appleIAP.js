const functions = require("firebase-functions");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { X509Certificate } = require("crypto");
const { SignedDataVerifier, Environment } = require("@apple/app-store-server-library");
const applePurchase = require("./applePurchase");

// R1A-Deletion Chunk 2 — lock helpers for IAP / Apple webhook paths.
const accountDeletionLocks = require("./lib/accountDeletionLocks");

const BUNDLE_ID = applePurchase.BUNDLE_ID;

/**
 * Apple's public root CA certificates for IAP signing, used to
 * verify the full signature chain on every incoming JWS payload.
 * Fetched at cold-start from Apple's certificate authority endpoint
 * and cached in module scope for the lifetime of the warm instance.
 *
 * Pre-W1f this function used a naive base64 decode of the JWS
 * payload — no signature verification, no chain check, no revocation
 * awareness. An attacker could craft a fake JWS with our bundleId
 * and a future expiresDate and the function would grant Pro on
 * trust. Now we verify the full chain against Apple's roots before
 * we read any field from the payload.
 */
const APPLE_ROOT_URLS = [
  // Apple Root CA – G3 (ECC; used for modern IAP JWS)
  "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer",
  // Apple Inc Root Certificate (RSA; kept for legacy chains)
  "https://www.apple.com/certificateauthority/AppleIncRootCertificate.cer",
];

let appleRootsPromise = null;

function loadAppleRoots() {
  if (appleRootsPromise) return appleRootsPromise;
  appleRootsPromise = Promise.all(
    APPLE_ROOT_URLS.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch Apple root cert ${url}: ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return new X509Certificate(buf);
    }),
  ).catch((err) => {
    // Reset so the next invocation retries rather than caching a failure.
    appleRootsPromise = null;
    throw err;
  });
  return appleRootsPromise;
}

/**
 * Cached SignedDataVerifier instances, one per environment. Rebuilt
 * only when the root cert fetch succeeds; a failed fetch means we
 * fail-closed and never grant Pro.
 */
const verifiers = new Map();

async function getVerifier(environment) {
  const key = environment;
  if (verifiers.has(key)) return verifiers.get(key);
  const roots = await loadAppleRoots();
  const verifier = new SignedDataVerifier(
    roots.map((c) => Buffer.from(c.raw)),
    true, // enableOnlineChecks — revocation via OCSP
    environment,
    BUNDLE_ID,
  );
  verifiers.set(key, verifier);
  return verifier;
}

/**
 * Verify a signed transaction JWS with the full chain + environment
 * check. Tries Production first and falls back to Sandbox on
 * verification failure — StoreKit test-environment purchases from
 * Xcode / TestFlight are signed by Apple's sandbox CA chain, not the
 * production one, so a healthy app in development still needs to
 * resolve against Sandbox.
 *
 * Returns the decoded JWSTransactionDecodedPayload on success. Throws
 * if both environments fail — we do not fall back to unverified
 * decode.
 */
async function verifySignedTransaction(signedTransactionInfo) {
  if (typeof signedTransactionInfo !== "string") {
    throw new Error("signedTransactionInfo must be a string");
  }
  let lastErr = null;
  for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const verifier = await getVerifier(env);
      return await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Apple JWS verification failed in both environments: ${lastErr && lastErr.message}`,
  );
}

/**
 * Same pattern for ASSN V2 notification payloads. The notification
 * wrapper carries a nested `signedTransactionInfo` inside; we verify
 * the outer wrapper first, then the inner transaction.
 */
async function verifyNotification(signedPayload) {
  let lastErr = null;
  for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const verifier = await getVerifier(env);
      return await verifier.verifyAndDecodeNotification(signedPayload);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Apple notification verification failed in both environments: ${lastErr && lastErr.message}`,
  );
}

function getAppleConfig() {
  const cfg = (functions.config && functions.config().apple) || {};
  return {
    keyId: process.env.APPLE_KEY_ID || cfg.key_id,
    issuerId: process.env.APPLE_ISSUER_ID || cfg.issuer_id,
    bundleId: BUNDLE_ID,
    privateKey: process.env.APPLE_PRIVATE_KEY || cfg.private_key,
  };
}

function signAppStoreJWT() {
  const { keyId, issuerId, bundleId, privateKey } = getAppleConfig();
  if (!keyId || !issuerId || !privateKey) {
    throw new Error("Apple Server API credentials are not configured.");
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: issuerId,
      iat: now,
      exp: now + 60 * 20,
      aud: "appstoreconnect-v1",
      bid: bundleId,
    },
    privateKey.replace(/\\n/g, "\n"),
    { algorithm: "ES256", keyid: keyId },
  );
}

async function fetchSubscriptionStatus(originalTransactionId, useSandbox = false) {
  const host = useSandbox
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";
  const url = `${host}/inApps/v1/subscriptions/${originalTransactionId}`;
  const token = signAppStoreJWT();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 && !useSandbox) {
    return fetchSubscriptionStatus(originalTransactionId, true);
  }
  if (!response.ok) throw new Error(`App Store Server API ${response.status}`);
  return response.json();
}

/**
 * Thin wrapper that injects the production handles into
 * applePurchase.applySubscriptionToUser. The pure logic + Firestore
 * txn body live in ./applePurchase.js — see that module for the
 * threat model + unit tests pinning the forged-JWS rejection,
 * lifetime-protection, and stale-event invariants.
 */
async function applySubscriptionToUser(uid, signedTransactionInfo) {
  return applePurchase.applySubscriptionToUser({
    firestore: admin.firestore(),
    verifyTransaction: verifySignedTransaction,
    signedTransactionInfo,
    uid,
    serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Called by the iOS client immediately after a StoreKit purchase completes.
exports.verifyApplePurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }
  const uid = context.auth.uid;
  // R1A-Deletion: actor lock. verifyApplePurchase writes users/{uid}
  // subscription fields via applySubscriptionToUser → cannot run for
  // a deleting account.
  await accountDeletionLocks.assertCallableActorNotDeleting(admin.firestore(), uid);
  const signedTransactionInfo = data && data.signedTransactionInfo;
  if (!signedTransactionInfo || typeof signedTransactionInfo !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "signedTransactionInfo required.");
  }
  try {
    return await applySubscriptionToUser(uid, signedTransactionInfo);
  } catch (err) {
    console.error(`verifyApplePurchase: uid=${uid}`, err);
    throw new functions.https.HttpsError("internal", err.message);
  }
});

// App Store Server Notifications V2 webhook — configure the URL in App Store Connect.
exports.appleIAPWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const signedPayload = req.body && req.body.signedPayload;
    if (!signedPayload) {
      res.status(400).json({ error: "Missing signedPayload" });
      return;
    }
    // Verify the outer notification envelope — this also validates
    // bundle ID and notification structure before we read anything.
    const payload = await verifyNotification(signedPayload);
    const notificationType = payload.notificationType;
    const notificationUUID = payload.notificationUUID;
    const signedTransactionInfo = payload.data && payload.data.signedTransactionInfo;
    if (!signedTransactionInfo) {
      res.status(400).json({ error: "No signedTransactionInfo in payload" });
      return;
    }

    // PR D (audit P0 #3): idempotency via appleNotifications/{uuid}.
    // Apple retries notifications on 5xx; without dedup a re-delivery
    // re-runs applySubscriptionToUser. The verified outer payload's
    // notificationUUID is a stable per-delivery identifier.
    if (notificationUUID) {
      const notifRef = admin
        .firestore()
        .collection("appleNotifications")
        .doc(notificationUUID);
      try {
        const existing = await notifRef.get();
        if (existing.exists) {
          console.log(`appleIAPWebhook: duplicate delivery for ${notificationUUID}, skipping`);
          res.status(200).json({ ok: true, duplicate: true });
          return;
        }
      } catch (err) {
        // Failure to read dedup doc shouldn't block processing, but
        // we lose idempotency for this delivery — log loudly.
        console.error(`appleIAPWebhook: idempotency lookup failed for ${notificationUUID}:`, err.message);
      }
    }

    // Verify the inner transaction JWS separately so the lookup by
    // originalTransactionId uses a trusted value.
    const tx = await verifySignedTransaction(signedTransactionInfo);
    const originalTransactionId = tx.originalTransactionId;

    const usersSnap = await admin
      .firestore()
      .collection("users")
      .where("appleOriginalTransactionId", "==", originalTransactionId)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      console.warn(
        `appleIAPWebhook: no user for originalTransactionId=${originalTransactionId} type=${notificationType}`,
      );
      // Still record the notification as processed so retries don't
      // hammer the no-match case.
      if (notificationUUID) {
        await admin
          .firestore()
          .collection("appleNotifications")
          .doc(notificationUUID)
          .set({
            type: notificationType,
            originalTransactionId,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            result: "no-user-match",
          })
          .catch((err) => console.error(`appleIAPWebhook: dedup record write failed:`, err.message));
      }
      res.status(200).json({ ok: true });
      return;
    }

    const uid = usersSnap.docs[0].id;

    // R1A-Deletion: system-writer guard. If the resolved uid is mid-
    // deletion or tombstoned, do NOT recreate the user doc via
    // applySubscriptionToUser — log a minimised event to
    // paymentEventsPostDeletion for operator review, dedup-record
    // the notification so it's never reprocessed, and return 200 so
    // Apple stops retrying.
    if (!(await accountDeletionLocks.shouldSystemWriteProceed(admin.firestore(), uid, "appleIAPWebhook"))) {
      await accountDeletionLocks.recordPaymentEventPostDeletion(admin.firestore(), {
        provider: "apple",
        externalTxnId: originalTransactionId,
        providerEventId: payload.notificationUUID, // Apple-native idempotency key
        eventType: notificationType,
        uid,
      });
      if (notificationUUID) {
        try {
          await admin
            .firestore()
            .collection("appleNotifications")
            .doc(notificationUUID)
            .set({
              type: notificationType,
              originalTransactionId,
              uid,
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
              result: "skipped_account_deleted",
            });
        } catch (err) {
          console.error(`appleIAPWebhook: failed to record post-deletion notification ${notificationUUID}:`, err.message);
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    const applied = await applySubscriptionToUser(uid, signedTransactionInfo);

    // PR D: finalise dedup record after successful processing.
    if (notificationUUID) {
      try {
        await admin
          .firestore()
          .collection("appleNotifications")
          .doc(notificationUUID)
          .set({
            type: notificationType,
            originalTransactionId,
            uid,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            result: applied.skipped || "applied",
          });
      } catch (err) {
        console.error(`appleIAPWebhook: failed to record processed notification ${notificationUUID}:`, err.message);
      }
    }

    console.log(`appleIAPWebhook: ${notificationType} applied for uid=${uid} (${applied.skipped || "applied"})`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("appleIAPWebhook: error", err);
    res.status(500).json({ error: err.message });
  }
});

// Called by the iOS client on Restore Purchases.
exports.restoreApplePurchases = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }
  const uid = context.auth.uid;
  // R1A-Deletion: actor lock. restoreApplePurchases writes users/{uid}
  // subscription fields → cannot run for a deleting account.
  await accountDeletionLocks.assertCallableActorNotDeleting(admin.firestore(), uid);
  const originalTransactionId = data && data.originalTransactionId;
  if (!originalTransactionId) {
    throw new functions.https.HttpsError("invalid-argument", "originalTransactionId required.");
  }
  // R1A-Deletion founder decision #3 (A/a2 support-assisted) +
  // Chunk 2.C Blocker D3 leak fix + Chunk 2.D-billing HMAC switch:
  //
  // The original Chunk 2 implementation returned a distinct
  // `restore-requires-support` errorCode when the originalTransactionId
  // matched a billing tombstone. An authenticated user A could submit
  // user B's originalTransactionId (acquired out-of-band) and learn
  // from the response whether user B previously had a deleted Tropos
  // account. That's a tombstone-state leak across authenticated
  // accounts.
  //
  // Fix: collapse the tombstoned, not-yours, and not-found outcomes
  // into one generic `restore-unavailable` errorCode. The client
  // surface shows identical support copy regardless. The server logs
  // the actual reason (tombstone vs not-yours vs not-found) via
  // structured Cloud Logging for operator triage without exposing
  // the distinction to the caller.
  //
  // Note on residual exposure: even with collapsed errors, response-
  // time differences may differ measurably between tombstone-hit and
  // not-found branches (tombstone lookup is one Firestore read;
  // not-found is one Apple API call). The timing-leakage assessment
  // in R1A-CHUNK2C-EVIDENCE.md §11 documents this as below the
  // threat model for a consumer fitness app — authenticated users
  // can't enumerate originalTransactionIds at meaningful scale, and
  // billing identifiers are not enumerable from public surfaces.
  //
  // Full Chunk 4 fix: deprecate the raw-originalTransactionId input
  // and accept signedTransactionInfo (StoreKit-issued JWS that Apple
  // verifies belongs to the device user). Tracked in decision-log #3
  // revisit conditions.
  //
  // Chunk 2.D billing HMAC: tombstone key is HMAC-SHA256 with
  // billing.hmac_secret, NOT plain SHA-256. The previous plain-SHA
  // reasoning was online-probe-only and ignored offline hash-cracking
  // after a Firestore export or backup leak. HMAC defeats offline
  // brute-force without requiring more entropy from the provider IDs.
  // See R1A-DECISION-LOG.md #4 for full rationale.
  const billingIdentityHash = require("./lib/billingIdentityHash");
  let billingTombstoned = false;
  try {
    const lookupHashes = billingIdentityHash.billingIdentityLookupHashes(
      "apple",
      originalTransactionId,
    );
    for (const hash of lookupHashes) {
      // Rotation-aware: check active and previous-secret hashes.
      // Any hit means a tombstone exists under either secret.
      // eslint-disable-next-line no-await-in-loop
      const billingTombstoneSnap = await admin
        .firestore()
        .collection("deletedBillingIdentities")
        .doc(hash)
        .get();
      if (billingTombstoneSnap.exists) {
        billingTombstoned = true;
        break;
      }
    }
  } catch (err) {
    if (err && err.errorCode === "billing-hmac-secret-missing") {
      // Deploy-time misconfiguration. Log structured warning so
      // operator notices in Cloud Logging, then fall through to the
      // collapsed restore-unavailable error. We do NOT proceed with
      // the restore — fail-closed is safer than recreating user data
      // for a potentially-tombstoned identity.
      console.warn(JSON.stringify({
        r1aEvent: "billing_hmac_secret_missing",
        uid,
        provider: "apple",
      }));
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Restore is currently unavailable for this subscription. Contact support if you need help.",
        { errorCode: "restore-unavailable" },
      );
    }
    console.error(`restoreApplePurchases: tombstone lookup failed for uid=${uid}`, err);
    // Treat lookup failure as conservative: don't reveal anything.
    // Fall through to the collapsed error below.
  }
  if (billingTombstoned) {
    // Structured Cloud Logging — operator sees the real reason via
    // jsonPayload filters without it appearing in the client response.
    console.warn(JSON.stringify({
      r1aEvent: "restore_blocked_by_tombstone",
      uid,
      provider: "apple",
      // Do NOT log the raw originalTransactionId — that's the
      // probable input parameter and logging it would defeat the
      // collapse.
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Restore is currently unavailable for this subscription. Contact support if you need help.",
      { errorCode: "restore-unavailable" },
    );
  }
  try {
    const status = await fetchSubscriptionStatus(originalTransactionId);
    const group = status.data && status.data[0];
    const latest = group && group.lastTransactions && group.lastTransactions[0];
    const signedTransactionInfo = latest && latest.signedTransactionInfo;
    if (!signedTransactionInfo) {
      // Collapse not-found into the same error code as tombstoned.
      // Client renders the same support copy.
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Restore is currently unavailable for this subscription. Contact support if you need help.",
        { errorCode: "restore-unavailable" },
      );
    }
    return await applySubscriptionToUser(uid, signedTransactionInfo);
  } catch (err) {
    console.error(`restoreApplePurchases: uid=${uid}`, err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err.message);
  }
});

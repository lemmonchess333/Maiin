const functions = require("firebase-functions");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { X509Certificate } = require("crypto");
const { SignedDataVerifier, Environment } = require("@apple/app-store-server-library");

// R1A-Deletion Chunk 2 — lock helpers for IAP / Apple webhook paths.
const accountDeletionLocks = require("./lib/accountDeletionLocks");

const BUNDLE_ID = "com.tropos.app";

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

async function applySubscriptionToUser(uid, signedTransactionInfo) {
  // VERIFY before we trust any field. verifySignedTransaction throws
  // if the JWS doesn't chain back to Apple's roots OR if the bundle
  // ID doesn't match OR if the payload fails schema validation. We
  // never grant entitlement on an unverified payload.
  const tx = await verifySignedTransaction(signedTransactionInfo);
  if (tx.bundleId !== BUNDLE_ID) {
    // SignedDataVerifier already enforces bundleId, but defence in
    // depth — a misconfigured verifier would otherwise silently let
    // another app's transactions through.
    throw new Error(`Bundle mismatch: ${tx.bundleId}`);
  }
  const productId = tx.productId;
  const originalTransactionId = tx.originalTransactionId;
  const expiresMs = Number(tx.expiresDate);
  const expiresAt = new Date(expiresMs);
  const isActive = expiresAt > new Date();

  await admin.firestore().collection("users").doc(uid).set(
    {
      subscriptionTier: isActive ? "pro" : "free",
      appleOriginalTransactionId: originalTransactionId,
      appleProductId: productId,
      subscriptionExpiresAt: expiresAt.toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { tier: isActive ? "pro" : "free", expiresAt: expiresAt.toISOString() };
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
    const signedTransactionInfo = payload.data && payload.data.signedTransactionInfo;
    if (!signedTransactionInfo) {
      res.status(400).json({ error: "No signedTransactionInfo in payload" });
      return;
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
      res.status(200).json({ ok: true });
      return;
    }

    const uid = usersSnap.docs[0].id;
    // R1A-Deletion: system-writer guard. If the resolved uid is mid-
    // deletion or tombstoned, do NOT recreate the user doc via
    // applySubscriptionToUser — log a minimised event to
    // paymentEventsPostDeletion for operator review.
    if (!(await accountDeletionLocks.shouldSystemWriteProceed(admin.firestore(), uid, "appleIAPWebhook"))) {
      await accountDeletionLocks.recordPaymentEventPostDeletion(admin.firestore(), {
        provider: "apple",
        externalTxnId: originalTransactionId,
        eventType: notificationType,
        uid,
      });
      res.status(200).json({ ok: true });
      return;
    }
    await applySubscriptionToUser(uid, signedTransactionInfo);
    console.log(`appleIAPWebhook: ${notificationType} applied for uid=${uid}`);
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
  // R1A-Deletion founder decision #3 (A/a2 support-assisted):
  // If the originalTransactionId belongs to a tombstoned billing
  // identity (the previous account was deleted), refuse the restore
  // with a stable errorCode so the client renders the support copy.
  // Implementation reads deletedBillingIdentities/{hash} — populated
  // by the Chunk 3 executor when deleting an account with active
  // billing.
  {
    const crypto = require("crypto");
    const identifierHash = crypto.createHash("sha256").update(originalTransactionId).digest("hex");
    const billingTombstoneSnap = await admin
      .firestore()
      .collection("deletedBillingIdentities")
      .doc(identifierHash)
      .get();
    if (billingTombstoneSnap.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This subscription was attached to a deleted account. Contact support to restore.",
        { errorCode: "restore-requires-support" },
      );
    }
  }
  try {
    const status = await fetchSubscriptionStatus(originalTransactionId);
    const group = status.data && status.data[0];
    const latest = group && group.lastTransactions && group.lastTransactions[0];
    const signedTransactionInfo = latest && latest.signedTransactionInfo;
    if (!signedTransactionInfo) {
      throw new functions.https.HttpsError("not-found", "No subscription found.");
    }
    return await applySubscriptionToUser(uid, signedTransactionInfo);
  } catch (err) {
    console.error(`restoreApplePurchases: uid=${uid}`, err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err.message);
  }
});

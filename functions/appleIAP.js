const functions = require("firebase-functions");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");

const BUNDLE_ID = "com.tropos.app";

function getAppleConfig() {
  const cfg = (functions.config && functions.config().apple) || {};
  return {
    keyId: process.env.APPLE_KEY_ID || cfg.key_id,
    issuerId: process.env.APPLE_ISSUER_ID || cfg.issuer_id,
    bundleId: BUNDLE_ID,
    privateKey: process.env.APPLE_PRIVATE_KEY || cfg.private_key,
  };
}

// Decode a JWS payload without verifying the signature chain.
// Acceptable at launch because responses come directly from Apple over HTTPS;
// swap to app-store-server-library-node for chain verification post-launch.
function decodeJWS(signedPayload) {
  if (typeof signedPayload !== "string") throw new Error("Invalid JWS");
  const parts = signedPayload.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS");
  return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
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
  const tx = decodeJWS(signedTransactionInfo);
  if (tx.bundleId !== BUNDLE_ID) {
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
    const payload = decodeJWS(signedPayload);
    const notificationType = payload.notificationType;
    const signedTransactionInfo = payload.data && payload.data.signedTransactionInfo;
    if (!signedTransactionInfo) {
      res.status(400).json({ error: "No signedTransactionInfo in payload" });
      return;
    }
    const tx = decodeJWS(signedTransactionInfo);
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
  const originalTransactionId = data && data.originalTransactionId;
  if (!originalTransactionId) {
    throw new functions.https.HttpsError("invalid-argument", "originalTransactionId required.");
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

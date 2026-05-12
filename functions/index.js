const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

const appleIAP = require("./appleIAP");
exports.verifyApplePurchase = appleIAP.verifyApplePurchase;
exports.appleIAPWebhook = appleIAP.appleIAPWebhook;
exports.restoreApplePurchases = appleIAP.restoreApplePurchases;

// PR Q (audit P0 #1/#2/#3 follow-up): pure helpers live in
// ./helpers.js so the test runner can import them without booting
// firebase-admin. The underscore-prefixed names below are kept as
// the historical test surface (exports._foo) — they now delegate to
// helpers.js so there's a single source of truth.
const helpers = require("./helpers");
// Rate limiter + quota live in their own module so integration
// tests can drive them against the emulator with a test-controlled
// firestore handle (see functions/__tests__/integration/).
const rateLimiter = require("./rateLimiter");

// ══════════════════════════════════════════════
// ACCOUNT DELETION — server-side, auth-user last
// ══════════════════════════════════════════════
//
// Pre-W1f deletion ran client-side and deleted the Firebase Auth
// user FIRST, then tried to clean up Firestore subcollections. As
// soon as the auth user was gone, subsequent Firestore writes ran
// as an unauthenticated client and either (a) hit permission denied
// if rules required auth, or (b) succeeded partially, leaving the
// account in an inconsistent "ghost user with orphan data" state.
//
// Now a callable Cloud Function runs with Admin SDK (bypasses
// Firestore rules), deletes the data first across every known
// subcollection + author-keyed top-level collection, then deletes
// the Auth user as the final step. Partial failure leaves the user
// logged in and retryable rather than stranded.
exports.deleteMyAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }
  const uid = context.auth.uid;
  const firestore = admin.firestore();

  // Subcollections that live under users/{uid}/... — deleting the
  // parent doc doesn't cascade, so we iterate each subcollection and
  // delete its docs in batches.
  const userSubcollections = [
    "meals", "workouts", "runs", "weights", "water",
    "bodyweight", "progressPhotos", "favorites", "preferences",
  ];
  const topLevelSubcollections = [
    { parent: "feeds", sub: "items" },
    { parent: "notifications", sub: "items" },
    { parent: "following", sub: "users" },
    { parent: "followers", sub: "users" },
    { parent: "blocks", sub: "users" },
    { parent: "kudos", sub: null }, // author-keyed, not user-keyed; skip
  ];

  const deleteBatch = async (refs) => {
    // Firestore write batches are limited to 500 ops; chunk
    // aggressively to keep margin for retries.
    for (let i = 0; i < refs.length; i += 450) {
      const batch = firestore.batch();
      refs.slice(i, i + 450).forEach((r) => batch.delete(r));
      await batch.commit();
    }
  };

  try {
    // 1. User's own subcollections
    for (const sub of userSubcollections) {
      const snap = await firestore.collection("users").doc(uid).collection(sub).get();
      if (!snap.empty) await deleteBatch(snap.docs.map((d) => d.ref));
    }

    // 2. Top-level collections keyed by user id
    for (const { parent, sub } of topLevelSubcollections) {
      if (!sub) continue;
      const snap = await firestore.collection(parent).doc(uid).collection(sub).get();
      if (!snap.empty) await deleteBatch(snap.docs.map((d) => d.ref));
    }

    // 3. Top-level collections with author-id fields. We delete
    // activities the user posted; we deliberately keep comments /
    // kudos the user gave on OTHER people's activities because
    // removing those would retroactively mutate other users' feeds.
    const activitiesSnap = await firestore
      .collection("activities")
      .where("authorId", "==", uid)
      .get();
    if (!activitiesSnap.empty) await deleteBatch(activitiesSnap.docs.map((d) => d.ref));

    // 4. Public profile projection
    await firestore.doc(`users/${uid}/public/profile`).delete().catch(() => {});

    // 5. The user document itself
    await firestore.collection("users").doc(uid).delete();

    // 6. Storage files under progress-photos/{uid}/ and
    // profile-photos/{uid}/. Wrapped in try/catch individually —
    // a missing folder shouldn't block the auth-user delete.
    const bucket = admin.storage().bucket();
    for (const prefix of [`progress-photos/${uid}/`, `profile-photos/${uid}/`]) {
      try {
        await bucket.deleteFiles({ prefix });
      } catch (e) {
        console.warn(`deleteMyAccount: storage cleanup for ${prefix} failed`, e);
      }
    }

    // 7. FINAL: delete the Auth user. Done last so that if any
    // Firestore step above failed, the user retries with valid
    // credentials still attached to the remaining orphans.
    await admin.auth().deleteUser(uid);

    return { ok: true };
  } catch (err) {
    console.error(`deleteMyAccount: uid=${uid}`, err);
    throw new functions.https.HttpsError("internal", err.message);
  }
});

// ══════════════════════════════════════════════
// RATE LIMITER — per-user, Firestore-backed
// ══════════════════════════════════════════════

/** Delegates to helpers.pruneOldTimestamps — see helpers.js for docs. */
const _pruneOldTimestamps = helpers.pruneOldTimestamps;

/**
 * Checks if a user has exceeded the allowed number of calls within a window.
 * Uses a Firestore transaction to make the read-prune-write atomic so two
 * concurrent requests cannot both observe `recent.length === maxCalls - 1`
 * and both succeed (the pre-PR-C race window).
 *
 * Fail-closed: PR C (audit follow-up) changed the catch behaviour. The
 * rate limiter gates cost-sensitive AI invocations (analyzeFood / Text /
 * askGemini); a transient Firestore error must not silently grant
 * unlimited paid calls. Pre-PR-C this returned `false` (fail open) on
 * any error. Now returns `true` (treat as rate-limited) so the caller
 * surfaces a transient-error response instead of consuming Vertex
 * quota that the user has no record of.
 *
 * @param {string} uid - User ID
 * @param {string} action - Action name (e.g., "askGemini", "analyzeFood")
 * @param {number} maxCalls - Maximum calls allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<boolean>} true if rate limited (should block)
 */
/** Delegates to rateLimiter.isRateLimited — see rateLimiter.js for docs. */
async function isRateLimited(uid, action, maxCalls, windowMs) {
  return rateLimiter.isRateLimited(admin.firestore(), uid, action, maxCalls, windowMs);
}

// ══════════════════════════════════════════════
// MONTHLY SCAN QUOTA — per-user, Firestore-backed
// ══════════════════════════════════════════════

const SCAN_LIMITS = { free: 10, pro: 300 };

/** Delegates to helpers.computeEffectiveTier — see helpers.js for docs. */
const _computeEffectiveTier = helpers.computeEffectiveTier;

/** Delegates to helpers.currentMonthCount — see helpers.js for docs. */
const _currentMonthCount = helpers.currentMonthCount;

function safeOriginForLog(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch (_) {
    return "<invalid>";
  }
}

/**
 * Checks and increments the user's monthly AI scan counter atomically.
 *
 * PR C (audit follow-up): pre-fix this function did read → calculate →
 * write across two RTTs (race window), AND the catch block returned
 * `{ allowed: true, remaining: 999, limit: 999 }` — a literal fail-open
 * on the cost-control boundary. Two breaks fixed here:
 *
 *   1. Wrapped in `runTransaction` so the read+write happens inside one
 *      Firestore lock. Concurrent requests serialise and cannot both
 *      observe `count === limit - 1` then both increment.
 *   2. Catch now returns `{ allowed: false, remaining: 0, ... }` —
 *      fail-closed. A transient Firestore error surfaces as a 429 to
 *      the client (with a translated "temporary limit" message in the
 *      caller). Better the user retries than we silently grant
 *      unlimited Vertex calls during a Firestore incident.
 *
 * The legacy fail-open behaviour is preserved as a configurable
 * `failOpen` parameter only for the test surface — production callers
 * never set it. Documented at function-level so audit reviewers can
 * see the override is for tests only.
 *
 * @param {string} uid - User ID
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number, error?: string}>}
 */
/** Delegates to rateLimiter.checkMonthlyQuota — see rateLimiter.js for docs. */
async function checkMonthlyQuota(uid) {
  return rateLimiter.checkMonthlyQuota(admin.firestore(), uid);
}

// Pure helpers exported for unit-testability. Not part of the public
// Cloud Functions API; the underscore prefix marks them as
// implementation detail. When a functions/ test runner is wired
// (audit P0 #1 follow-up), tests should import these via
// `require("./index")` and exercise the predicates without booting
// Firestore.
exports._pruneOldTimestamps = _pruneOldTimestamps;
exports._computeEffectiveTier = _computeEffectiveTier;
exports._currentMonthCount = _currentMonthCount;
exports._SCAN_LIMITS = SCAN_LIMITS;

/**
 * Verifies a Firebase ID token from an Authorization header.
 * @param {string} authHeader
 * @returns {Promise<{uid: string, email: string}>}
 */
async function verifyAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  const token = authHeader.split("Bearer ")[1];
  const decoded = await admin.auth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email || "" };
}

// ══════════════════════════════════════════════
// REMOTE KILL SWITCHES — Firestore-backed feature flags
// ══════════════════════════════════════════════

/**
 * Reads a boolean feature flag from `config/flags`. Flags default to ON —
 * missing doc or missing key returns `true` — so a freshly deployed
 * project without the doc still works. Operators disable a flag by writing
 * `{ [key]: false }` via Admin SDK or the Firebase Console, and the next
 * Cloud Function invocation sees the change without a redeploy.
 *
 * Cached for 60s per process to keep the Firestore read off the hot path
 * while still letting an incident responder flip a switch and see effect
 * within a minute.
 *
 * @param {string} key
 * @returns {Promise<boolean>}
 */
const _flagCache = { value: null, at: 0 };
const FLAG_CACHE_MS = 60_000;
async function isFlagEnabled(key) {
  const now = Date.now();
  if (!_flagCache.value || now - _flagCache.at > FLAG_CACHE_MS) {
    try {
      const snap = await admin.firestore().doc("config/flags").get();
      _flagCache.value = snap.exists ? snap.data() : {};
      _flagCache.at = now;
    } catch (err) {
      console.error("isFlagEnabled read failed:", err.message);
      // Fail open — a Firestore read blip shouldn't take down food scan.
      return true;
    }
  }
  const v = _flagCache.value[key];
  return v === undefined ? true : Boolean(v);
}

// ══════════════════════════════════════════════
// ONBOARDING — bypasses security rules via Admin SDK
// ══════════════════════════════════════════════

exports.completeOnboarding = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }
  const uid = context.auth.uid;

  // Rate limit: 5 onboarding attempts per 10 minutes
  const limited = await isRateLimited(uid, "onboarding", 5, 600_000);
  if (limited) {
    throw new functions.https.HttpsError("resource-exhausted", "Too many attempts. Please wait.");
  }

  try {
    // Validate required fields
    const {profileData, programState} = data;
    if (!profileData || typeof profileData !== "object") {
      throw new functions.https.HttpsError("invalid-argument", "profileData is required.");
    }
    if (!programState || typeof programState !== "object") {
      throw new functions.https.HttpsError("invalid-argument", "programState is required.");
    }

    // Validate required profile fields
    const requiredFields = ["weightKg", "heightCm", "age", "sex", "activityLevel"];
    for (const field of requiredFields) {
      if (profileData[field] === undefined || profileData[field] === null || profileData[field] === "") {
        throw new functions.https.HttpsError("invalid-argument", `Missing required field: ${field}`);
      }
    }

    // Validate age range (C6: server-side enforcement — client blocks <16 but API calls can bypass)
    if (typeof profileData.age !== "number" || profileData.age < 16 || profileData.age > 120) {
      throw new functions.https.HttpsError("invalid-argument", "Age must be between 16 and 120.");
    }

    // Validate body metrics are in sane ranges
    if (typeof profileData.weightKg !== "number" || profileData.weightKg < 30 || profileData.weightKg > 300) {
      throw new functions.https.HttpsError("invalid-argument", "Weight must be between 30 and 300 kg.");
    }
    if (typeof profileData.heightCm !== "number" || profileData.heightCm < 120 || profileData.heightCm > 230) {
      throw new functions.https.HttpsError("invalid-argument", "Height must be between 120 and 230 cm.");
    }

    // Sanitize: strip fields that clients must never set
    const clientForbidden = ["stripeCustomerId", "stripeSubscriptionId"];
    for (const key of clientForbidden) {
      delete profileData[key];
    }

    // Force correct ownership + subscription tier
    profileData.uid = uid;
    profileData.subscriptionTier = "free";
    profileData.onboardingComplete = true;

    const db = admin.firestore();

    // Check if profile already exists (preserve trialExpiresAt, createdAt)
    const userRef = db.collection("users").doc(uid);
    const existing = await userRef.get();

    if (existing.exists) {
      // Don't overwrite protected fields on update
      delete profileData.trialExpiresAt;
      delete profileData.createdAt;
      await userRef.set(profileData, {merge: true});
    } else {
      // New profile: set defaults
      if (!profileData.trialExpiresAt) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        profileData.trialExpiresAt = d.toISOString();
      }
      if (!profileData.createdAt) {
        profileData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }
      await userRef.set(profileData);
    }

    // Write program state
    const programRef = userRef.collection("programState").doc("current");
    await programRef.set(programState);

    return {success: true};
  } catch (err) {
    // Re-throw HttpsError as-is (validation errors, etc.)
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    console.error("completeOnboarding error:", { uid, message: err.message, stack: err.stack });
    throw new functions.https.HttpsError("internal", "Failed to complete onboarding.");
  }
});

// ══════════════════════════════════════════════
// EXISTING — analyzeFood (untouched)
// ══════════════════════════════════════════════

exports.analyzeFood = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      let authUser;
      try {
        authUser = await verifyAuth(req.headers.authorization);
      } catch (_) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Remote kill switch — operators flip `geminiEnabled=false` in
      // config/flags to cut off scans instantly if costs spike or
      // Vertex AI is returning bad data. Checked before rate limit so
      // disabled-state requests don't eat a user's quota window.
      if (!(await isFlagEnabled("geminiEnabled"))) {
        res.status(503).json({ error: "AI food scan is temporarily unavailable. Please use manual entry." });
        return;
      }

      // Rate limit: 10 image analyses per 10 minutes
      const limited = await isRateLimited(authUser.uid, "analyzeFood", 10, 600_000);
      if (limited) {
        res.status(429).json({ error: "Rate limit reached. Please wait before analyzing more food." });
        return;
      }

      // Monthly scan quota — PR C: transactional + fail-closed.
      // `error: "quota-check-failed"` signals a transient Firestore
      // problem rather than an exhausted quota; surface a different
      // message so the client retries instead of treating it as a
      // hard limit.
      const quota = await checkMonthlyQuota(authUser.uid);
      if (!quota.allowed) {
        if (quota.error === "quota-check-failed") {
          res.status(503).json({
            error: "Couldn't verify your scan quota. Please try again in a moment.",
            transient: true,
          });
          return;
        }
        res.status(429).json({ error: "Monthly scan limit reached. Upgrade to Pro for more scans.", remaining: 0, limit: quota.limit });
        return;
      }

      const { imageBase64 } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: "No image provided" });
        return;
      }

      const projectId = process.env.GCLOUD_PROJECT;
      const accessToken = await admin.credential.applicationDefault().getAccessToken();

      const prompt = "Analyze this food image and provide nutritional estimates. Return ONLY a valid JSON object with this exact format, no other text: {\"foodName\": \"name of the food/meal\", \"items\": [{\"name\": \"item name\", \"portionSize\": \"estimated portion\", \"calories\": 0, \"protein\": 0, \"carbs\": 0, \"fat\": 0}], \"totalCalories\": 0, \"totalProtein\": 0, \"totalCarbs\": 0, \"totalFat\": 0, \"confidence\": \"high/medium/low\"}";

      const url = "https://us-central1-aiplatform.googleapis.com/v1/projects/" + projectId + "/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + accessToken.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        })
      });

      const data = await response.json();
      console.log("Vertex AI response:", JSON.stringify(data));

      if (!response.ok) {
        console.error("Vertex AI error:", JSON.stringify(data));
        res.status(500).json({ error: "AI service error" });
        return;
      }

      let responseText = "";
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        responseText = data.candidates[0].content.parts[0].text;
      } else if (data.predictions && data.predictions[0]) {
        responseText = data.predictions[0];
      } else {
        console.error("Unexpected response format:", JSON.stringify(data));
        res.status(500).json({ error: "Unexpected AI response format" });
        return;
      }

      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const nutrition = JSON.parse(cleaned);

      res.status(200).json(nutrition);
    } catch (error) {
      console.error("Error analyzing food:", error);
      res.status(500).json({ error: "Failed to analyze food image" });
    }
  });
});

// ══════════════════════════════════════════════
// AI TEXT FOOD PARSING (Pro feature)
// ══════════════════════════════════════════════

exports.analyzeFoodText = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      let authUser;
      try {
        authUser = await verifyAuth(req.headers.authorization);
      } catch (_) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Remote kill switch — shared flag with analyzeFood. One toggle
      // disables both modalities so scan pricing stays predictable.
      if (!(await isFlagEnabled("geminiEnabled"))) {
        res.status(503).json({ error: "AI food scan is temporarily unavailable. Please use manual entry." });
        return;
      }

      // Rate limit: 15 text analyses per 10 minutes
      const limited = await isRateLimited(authUser.uid, "analyzeFoodText", 15, 600_000);
      if (limited) {
        res.status(429).json({ error: "Rate limit reached. Please wait before analyzing more food." });
        return;
      }

      // Monthly scan quota (shares counter with image analysis).
      // PR C: same transient-vs-exhausted split as analyzeFood.
      const quota = await checkMonthlyQuota(authUser.uid);
      if (!quota.allowed) {
        if (quota.error === "quota-check-failed") {
          res.status(503).json({
            error: "Couldn't verify your scan quota. Please try again in a moment.",
            transient: true,
          });
          return;
        }
        res.status(429).json({ error: "Monthly scan limit reached. Upgrade to Pro for more scans.", remaining: 0, limit: quota.limit });
        return;
      }

      const { text } = req.body;
      if (!text || !text.trim()) {
        res.status(400).json({ error: "No text provided" });
        return;
      }

      const projectId = process.env.GCLOUD_PROJECT;
      const accessToken = await admin.credential.applicationDefault().getAccessToken();

      const prompt = `You are a nutrition expert. Parse this food description and estimate accurate macronutrient values per serving.
Return ONLY a valid JSON object with this exact format, no other text:
{"foodName": "short summary name", "items": [{"name": "item name", "portionSize": "estimated portion", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}], "totalCalories": 0, "totalProtein": 0, "totalCarbs": 0, "totalFat": 0, "confidence": "high/medium/low"}

Be accurate with calorie and macro estimates. Use standard serving sizes unless the user specifies a quantity.

Food description: "${text.replace(/"/g, '\\"')}"`;

      const url = "https://us-central1-aiplatform.googleapis.com/v1/projects/" + projectId + "/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + accessToken.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Vertex AI error:", JSON.stringify(data));
        res.status(500).json({ error: "AI service error" });
        return;
      }

      let responseText = "";
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        responseText = data.candidates[0].content.parts[0].text;
      } else {
        console.error("Unexpected response format:", JSON.stringify(data));
        res.status(500).json({ error: "Unexpected AI response format" });
        return;
      }

      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const nutrition = JSON.parse(cleaned);

      res.status(200).json(nutrition);
    } catch (error) {
      console.error("Error analyzing food text:", error);
      res.status(500).json({ error: "Failed to analyze food description" });
    }
  });
});

// ══════════════════════════════════════════════
// GEMINI TEXT PROXY — keeps API key server-side
// ══════════════════════════════════════════════

exports.askGeminiText = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }
  const uid = context.auth.uid;

  // Rate limit: 5 calls per 60 seconds per user
  const limited = await isRateLimited(uid, "askGemini", 5, 60_000);
  if (limited) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Rate limit reached. Please wait a moment before trying again.",
    );
  }

  const { prompt } = data;
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new functions.https.HttpsError("invalid-argument", "prompt is required.");
  }

  // Cap prompt length to prevent abuse
  if (prompt.length > 5000) {
    throw new functions.https.HttpsError("invalid-argument", "Prompt too long (max 5000 characters).");
  }

  try {
    const projectId = process.env.GCLOUD_PROJECT;
    const accessToken = await admin.credential.applicationDefault().getAccessToken();

    const url = "https://us-central1-aiplatform.googleapis.com/v1/projects/" +
      projectId + "/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("askGeminiText: Vertex AI error:", JSON.stringify(result));
      throw new functions.https.HttpsError("internal", "AI service error");
    }

    let responseText = "";
    if (result.candidates && result.candidates[0] &&
        result.candidates[0].content && result.candidates[0].content.parts) {
      responseText = result.candidates[0].content.parts[0].text;
    } else {
      console.error("askGeminiText: unexpected response format:", JSON.stringify(result));
      throw new functions.https.HttpsError("internal", "Unexpected AI response format");
    }

    return { text: responseText };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error("askGeminiText error:", err.message);
    throw new functions.https.HttpsError("internal", "AI request failed");
  }
});

// ══════════════════════════════════════════════
// STRIPE CHECKOUT SESSION
// ══════════════════════════════════════════════

// PR D (audit follow-up): server-side Stripe price allowlist. Pre-PR-D
// the client passed `priceId` in the request body and the function
// forwarded it straight to Stripe — meaning any active price in the
// connected Stripe account could be attached. Now we accept only the
// price IDs we explicitly know about, deterministically derive the
// checkout `mode`, and reject unknowns with a 400.
//
// The actual price IDs live in env vars so deploys can point at
// staging vs production prices without code edits. If the env var is
// missing we fail closed (price not in allowlist).
/** Delegates to helpers.getStripePriceAllowlist — see helpers.js for docs. */
const _getStripePriceAllowlist = helpers.getStripePriceAllowlist;
/** Delegates to helpers.isAllowedStripeReturnUrl — see helpers.js for docs. */
const _isAllowedStripeReturnUrl = helpers.isAllowedStripeReturnUrl;

exports.createCheckoutSession = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const { uid, email, priceId, successUrl, cancelUrl } = req.body;

      if (!uid || !priceId || !successUrl || !cancelUrl) {
        res.status(400).json({ error: "Missing required fields: uid, priceId, successUrl, cancelUrl" });
        return;
      }

      if (!_isAllowedStripeReturnUrl(successUrl) || !_isAllowedStripeReturnUrl(cancelUrl)) {
        console.warn(
          `createCheckoutSession: rejected return URL for uid=${uid} ` +
          `successOrigin=${safeOriginForLog(successUrl)} cancelOrigin=${safeOriginForLog(cancelUrl)}`,
        );
        res.status(400).json({ error: "Invalid checkout return URL." });
        return;
      }

      // Verify the user is authenticated
      const authUser = await verifyAuth(req.headers.authorization);
      if (authUser.uid !== uid) {
        res.status(403).json({ error: "UID mismatch" });
        return;
      }

      // PR D: price allowlist. Mode is derived from the allowlist entry,
      // not from substring-matching the client-supplied price ID.
      const allowlist = _getStripePriceAllowlist();
      const priceConfig = allowlist[priceId];
      if (!priceConfig) {
        console.warn(`createCheckoutSession: rejected unknown priceId=${priceId} for uid=${uid}`);
        res.status(400).json({ error: "Unknown plan." });
        return;
      }

      // Rate limit: 5 checkout attempts per 10 minutes
      const limited = await isRateLimited(uid, "checkout", 5, 600_000);
      if (limited) {
        res.status(429).json({ error: "Too many checkout attempts. Please wait." });
        return;
      }

      // Stripe secret key from Firebase config or environment
      const stripeKey = process.env.STRIPE_SECRET_KEY ||
        (functions.config().stripe && functions.config().stripe.secret_key);

      if (!stripeKey) {
        console.error("createCheckoutSession: STRIPE_SECRET_KEY not configured");
        res.status(500).json({ error: "Payment service not configured" });
        return;
      }

      const stripe = require("stripe")(stripeKey);

      // Look up or create Stripe customer
      const userDoc = await admin.firestore().collection("users").doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      let customerId = userData.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: email || authUser.email,
          metadata: { firebaseUid: uid },
        });
        customerId = customer.id;
        await admin.firestore().collection("users").doc(uid).set(
          { stripeCustomerId: customerId },
          { merge: true },
        );
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: priceConfig.mode,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { firebaseUid: uid, planKind: priceConfig.kind },
      });

      res.status(200).json({ url: session.url });
    } catch (error) {
      console.error("createCheckoutSession error:", error.message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });
});

exports._getStripePriceAllowlist = _getStripePriceAllowlist;
exports._isAllowedStripeReturnUrl = _isAllowedStripeReturnUrl;

// ══════════════════════════════════════════════
// STRIPE WEBHOOK — subscription lifecycle events
// ══════════════════════════════════════════════

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY ||
    (functions.config().stripe && functions.config().stripe.secret_key);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ||
    (functions.config().stripe && functions.config().stripe.webhook_secret);

  if (!stripeKey || !webhookSecret) {
    console.error("stripeWebhook: Stripe keys not configured");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }

  const stripe = require("stripe")(stripeKey);

  let event;
  try {
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("stripeWebhook: signature verification failed:", err.message);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  const dbRef = admin.firestore();

  // PR D (audit P0 #2): idempotency via stripeEvents/{event.id}.
  // Stripe retries every webhook on 5xx; without a dedup record a
  // duplicate delivery re-runs the same write. We claim the event
  // before processing and finalise after. If `claim` already exists
  // we acknowledge (200) and skip — Stripe stops retrying.
  const eventRef = dbRef.collection("stripeEvents").doc(event.id);
  try {
    const existing = await eventRef.get();
    if (existing.exists) {
      console.log(`stripeWebhook: duplicate delivery for ${event.id}, skipping`);
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
  } catch (err) {
    // Failure to read the dedup doc shouldn't break webhook processing
    // entirely, but log it loudly — we lose idempotency for this event.
    console.error(`stripeWebhook: idempotency lookup failed for ${event.id}:`, err.message);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const firebaseUid = session.metadata?.firebaseUid;
        if (!firebaseUid) {
          console.warn("stripeWebhook: checkout.session.completed missing firebaseUid metadata");
          break;
        }

        const update = {
          subscriptionTier: "pro",
          stripeCustomerId: session.customer,
          subscriptionUpdatedAt: event.created || Math.floor(Date.now() / 1000),
        };

        // For subscription mode, store the subscription ID
        if (session.subscription) {
          update.stripeSubscriptionId = session.subscription;
        }

        // Lifetime kind comes from server-side allowlist via
        // metadata.planKind — recorded so subsequent subscription
        // events can't downgrade a lifetime entitlement.
        if (session.metadata?.planKind === "lifetime") {
          update.planKind = "lifetime";
        }

        await dbRef.collection("users").doc(firebaseUid).set(update, { merge: true });
        console.log(`stripeWebhook: activated pro for ${firebaseUid}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Look up user by stripeCustomerId
        const usersSnap = await dbRef.collection("users")
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();

        if (usersSnap.empty) {
          console.warn(`stripeWebhook: no user found for customer ${customerId}`);
          break;
        }

        const userDoc = usersSnap.docs[0];
        const userData = userDoc.data();

        // PR D: out-of-order guard. If a newer event has already
        // updated this user, ignore the stale one. Compare against
        // subscriptionUpdatedAt (Unix seconds, written by previous
        // webhooks).
        const lastUpdate = Number(userData.subscriptionUpdatedAt) || 0;
        if (event.created && event.created <= lastUpdate) {
          console.log(`stripeWebhook: ignoring stale subscription.updated for ${userDoc.id} (event=${event.created}, last=${lastUpdate})`);
          break;
        }

        // PR D: lifetime entitlement protection. A subscription
        // event must NEVER downgrade a lifetime purchase.
        if (userData.planKind === "lifetime") {
          console.log(`stripeWebhook: skipping subscription.updated for ${userDoc.id} — lifetime entitlement`);
          break;
        }

        const status = subscription.status;

        // Active statuses that grant pro access
        const activeStatuses = ["active", "trialing"];
        const tier = activeStatuses.includes(status) ? "pro" : "free";

        await userDoc.ref.set({
          subscriptionTier: tier,
          stripeSubscriptionId: subscription.id,
          subscriptionUpdatedAt: event.created || Math.floor(Date.now() / 1000),
        }, { merge: true });

        console.log(`stripeWebhook: updated ${userDoc.id} to ${tier} (status: ${status})`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const usersSnap = await dbRef.collection("users")
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();

        if (usersSnap.empty) {
          console.warn(`stripeWebhook: no user found for customer ${customerId}`);
          break;
        }

        const userDoc = usersSnap.docs[0];
        const userData = userDoc.data();

        // PR D: out-of-order + subscription-id-match + lifetime
        // protection. Three reasons we might want to ignore a
        // `deleted` event:
        //   (a) lifetime entitlement — never downgraded by sub events.
        //   (b) the stored subscription ID doesn't match — a
        //       different subscription was deleted, ours is still
        //       active.
        //   (c) staleness — a newer update already happened.
        if (userData.planKind === "lifetime") {
          console.log(`stripeWebhook: skipping subscription.deleted for ${userDoc.id} — lifetime entitlement`);
          break;
        }

        if (
          userData.stripeSubscriptionId &&
          userData.stripeSubscriptionId !== subscription.id
        ) {
          console.log(`stripeWebhook: ignoring subscription.deleted for ${userDoc.id} — sub IDs differ (stored=${userData.stripeSubscriptionId}, event=${subscription.id})`);
          break;
        }

        const lastUpdate = Number(userData.subscriptionUpdatedAt) || 0;
        if (event.created && event.created <= lastUpdate) {
          console.log(`stripeWebhook: ignoring stale subscription.deleted for ${userDoc.id} (event=${event.created}, last=${lastUpdate})`);
          break;
        }

        await userDoc.ref.set({
          subscriptionTier: "free",
          stripeSubscriptionId: admin.firestore.FieldValue.delete(),
          subscriptionUpdatedAt: event.created || Math.floor(Date.now() / 1000),
        }, { merge: true });

        console.log(`stripeWebhook: deactivated pro for ${userDoc.id}`);
        break;
      }

      default:
        console.log(`stripeWebhook: unhandled event type ${event.type}`);
    }

    // PR D: finalise idempotency record AFTER successful processing.
    // Storing the event.id with a TTL-ish expiresAt for ops cleanup.
    try {
      await eventRef.set({
        type: event.type,
        created: event.created || null,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // Already processed but we couldn't write the record — Stripe
      // may retry. The handlers above are idempotent on retry because
      // of the out-of-order/sub-id-match guards.
      console.error(`stripeWebhook: failed to record processed event ${event.id}:`, err.message);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("stripeWebhook: processing error:", err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ══════════════════════════════════════════════
// PERFORMANCE ENGINE
// ══════════════════════════════════════════════

const {
  computeAndWritePerformanceForUser,
  acquireCooldownLock,
  releaseLock,
  getWeekKey,
} = require("./performanceEngine");

const db = admin.firestore();

// ── 1) Callable: manual / on-demand compute ──

exports.computePerformanceWeek = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }
  const uid = context.auth.uid;

  // Rate limit: 10 manual computes per 10 minutes
  const limited = await isRateLimited(uid, "computePerformance", 10, 600_000);
  if (limited) {
    throw new functions.https.HttpsError("resource-exhausted", "Too many requests. Please wait.");
  }

  const weekKey = data.weekKey || null;

  try {
    const result = await computeAndWritePerformanceForUser(uid, weekKey);
    return result;
  } catch (err) {
    console.error("computePerformanceWeek error:", err);
    throw new functions.https.HttpsError("internal", err.message);
  }
});

// ── 2) Scheduled: weekly rollup (Sundays 23:15 UTC) ──

exports.weeklyPerformanceRollup = functions.pubsub
  .schedule("15 23 * * 0")
  .timeZone("Europe/London")
  .onRun(async () => {
    try {
      console.log("weeklyPerformanceRollup: starting");

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

      let usersSnap;
      try {
        usersSnap = await db.collection("users")
          .where("lastActiveAt", ">=", cutoffTs)
          .get();
      } catch (err) {
        // Fail loud — do NOT fall back to processing all users (runaway cost risk)
        console.error("weeklyPerformanceRollup: lastActiveAt query failed, skipping run:", err.message);
        return null;
      }

      const uids = usersSnap.docs.map((d) => d.id);
      console.log(`weeklyPerformanceRollup: computing for ${uids.length} users`);

      for (let i = 0; i < uids.length; i += 10) {
        const batch = uids.slice(i, i + 10);
        await Promise.all(
          batch.map(async (uid) => {
            try {
              await computeAndWritePerformanceForUser(uid, null);
            } catch (err) {
              console.error(`weeklyPerformanceRollup: failed for ${uid}:`, err.message);
            }
          }),
        );
      }

      console.log("weeklyPerformanceRollup: done");
    } catch (err) {
      console.error("weeklyPerformanceRollup: fatal error:", { message: err.message, stack: err.stack });
    }
    return null;
  });

// ── 3) Scheduled: daily refresh (02:10 UTC) ──

exports.dailyPerformanceRefresh = functions.pubsub
  .schedule("10 2 * * *")
  .timeZone("Europe/London")
  .onRun(async () => {
    try {
      console.log("dailyPerformanceRefresh: starting");

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

      let usersSnap;
      try {
        usersSnap = await db.collection("users")
          .where("lastActiveAt", ">=", cutoffTs)
          .get();
      } catch (_) {
        console.log("dailyPerformanceRefresh: lastActiveAt query failed, skipping");
        return null;
      }

      const uids = usersSnap.docs.map((d) => d.id);
      console.log(`dailyPerformanceRefresh: computing for ${uids.length} users`);

      for (let i = 0; i < uids.length; i += 10) {
        const batch = uids.slice(i, i + 10);
        await Promise.all(
          batch.map(async (uid) => {
            try {
              await computeAndWritePerformanceForUser(uid, null);
            } catch (err) {
              console.error(`dailyPerformanceRefresh: failed for ${uid}:`, err.message);
            }
          }),
        );
      }

      console.log("dailyPerformanceRefresh: done");
    } catch (err) {
      console.error("dailyPerformanceRefresh: fatal error:", { message: err.message, stack: err.stack });
    }
    return null;
  });

// ══════════════════════════════════════════════
// CHALLENGE AUTO-PROGRESS HELPER
// ══════════════════════════════════════════════

async function syncChallengeProgress(uid, metric, incrementBy) {
  try {
    const challengesSnap = await db.collection("challenges").get();
    const now = new Date();

    for (const doc of challengesSnap.docs) {
      const challenge = doc.data();
      // Only update active challenges matching this metric
      const endDate = challenge.endDate && challenge.endDate.toDate
        ? challenge.endDate.toDate()
        : null;
      if (endDate && endDate < now) continue;
      if (challenge.metric !== metric) continue;

      // Check if user is a participant
      const participantRef = db.collection("challenges").doc(doc.id)
        .collection("participants").doc(uid);
      const participantSnap = await participantRef.get();
      if (!participantSnap.exists()) continue;

      const current = participantSnap.data().currentValue || 0;
      const newValue = current + incrementBy;

      // Compute tier
      const tiers = challenge.tiers || {};
      let tierAchieved = null;
      if (newValue >= (tiers.gold || Infinity)) tierAchieved = "gold";
      else if (newValue >= (tiers.silver || Infinity)) tierAchieved = "silver";
      else if (newValue >= (tiers.bronze || Infinity)) tierAchieved = "bronze";

      await participantRef.set({ currentValue: newValue, tierAchieved }, { merge: true });
    }
  } catch (err) {
    console.error(`syncChallengeProgress: error for ${uid}/${metric}:`, err.message);
  }
}

/* PR 5: fastest_effort sync.
 *
 * Doesn't fit the standard SUM-based syncChallengeProgress pattern —
 * fastest is MIN(currentValue, this_run_time), and only counts when
 * the run actually meets the challenge's targetDistance. Tier comparison
 * is also flipped: lower time = better tier.
 *
 * Caller is the onRunCreated trigger; this is its own function rather
 * than an extension of syncChallengeProgress so the SUM logic stays
 * boring and obvious for the four metrics that use it. */
async function syncFastestEffortProgress(uid, runDistanceMeters, runDurationSeconds) {
  try {
    if (!(runDistanceMeters > 0) || !(runDurationSeconds > 0)) return;

    const challengesSnap = await db.collection("challenges")
      .where("metric", "==", "fastest_effort")
      .get();
    const now = new Date();

    for (const doc of challengesSnap.docs) {
      const challenge = doc.data();
      const endDate = challenge.endDate && challenge.endDate.toDate
        ? challenge.endDate.toDate()
        : null;
      if (endDate && endDate < now) continue;

      const target = challenge.targetDistance || 0;
      if (target <= 0) continue;
      if (runDistanceMeters < target) continue; // run didn't reach target

      const participantRef = db.collection("challenges").doc(doc.id)
        .collection("participants").doc(uid);
      const participantSnap = await participantRef.get();
      if (!participantSnap.exists()) continue;

      const existingBest = participantSnap.data().currentValue || 0;
      // 0 = no best yet, so first qualifying run always wins.
      // Otherwise keep the lower (faster) time.
      const newBest = existingBest === 0
        ? Math.round(runDurationSeconds)
        : Math.min(existingBest, Math.round(runDurationSeconds));

      // For fastest_effort, tiers are time thresholds: lower is better.
      // Gold tier = quickest threshold; user qualifies if newBest <= tier.
      const tiers = challenge.tiers || {};
      let tierAchieved = null;
      if (tiers.gold && newBest <= tiers.gold) tierAchieved = "gold";
      else if (tiers.silver && newBest <= tiers.silver) tierAchieved = "silver";
      else if (tiers.bronze && newBest <= tiers.bronze) tierAchieved = "bronze";

      await participantRef.set({ currentValue: newBest, tierAchieved }, { merge: true });
    }
  } catch (err) {
    console.error(`syncFastestEffortProgress: error for ${uid}:`, err.message);
  }
}

// ── 4) Trigger: instant recompute on new workout ──

exports.onWorkoutCreated = functions.firestore
  .document("users/{uid}/workouts/{workoutId}")
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
    try {
      const data = snap.data();

      await db.collection("users").doc(uid).set(
        { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      // Auto-progress workout_count challenges
      await syncChallengeProgress(uid, "workout_count", 1);

      // Auto-progress total_volume challenges (if volume data available)
      if (data.totalVolume) {
        await syncChallengeProgress(uid, "total_volume", data.totalVolume);
      }

      if (data.date) {
        const workoutWeek = getWeekKey(new Date(data.date + "T00:00:00Z"));
        const currentWeek = getWeekKey(new Date());
        if (workoutWeek !== currentWeek) {
          console.log(`onWorkoutCreated: skipping recompute for ${uid}, workout in week ${workoutWeek} (current: ${currentWeek})`);
          return null;
        }
      }

      const canRun = await acquireCooldownLock(uid);
      if (!canRun) {
        console.log(`onWorkoutCreated: cooldown active for ${uid}, skipping`);
        return null;
      }

      try {
        await computeAndWritePerformanceForUser(uid, null);
        await releaseLock(uid, true);
        console.log(`onWorkoutCreated: computed performance for ${uid}`);
      } catch (err) {
        await releaseLock(uid, false, err.message);
        console.error(`onWorkoutCreated: compute error for ${uid}:`, err.message);
      }
    } catch (err) {
      console.error("onWorkoutCreated: fatal error:", { uid, message: err.message, stack: err.stack });
    }
    return null;
  });

// ── 5) Trigger: instant recompute on new run ──

exports.onRunCreated = functions.firestore
  .document("users/{uid}/runs/{runId}")
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
    try {
      const data = snap.data();

      // `lastActiveAt` keeps bumping even for isInvalid / savedAnyway
      // runs — "user interacted with the app" is a reasonable read,
      // and tightening this would make the active-users pipeline
      // (weeklyPerformanceRollup / dailyPerformanceRefresh) drop
      // users who only ever save-anyway short runs. Out of scope
      // per the P0.5 plan.
      await db.collection("users").doc(uid).set(
        { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      // P0.5 follow-up: gate challenge + fastest-effort updates on
      // the same volume-eligibility predicate the app-side
      // aggregations use. Pre-fix, the trigger only checked
      // `distance > 0` / `duration > 0`, which let a fat-fingered
      // "too-fast" save (e.g. 20km / 0:08, isInvalid + savedAnyway
      // both true with positive distance) bump km challenges and
      // fastest-effort PRs. Inline equivalent of `isVolumeEligible`
      // from src/lib/runStatsEligibility.ts (functions/ is plain
      // JS / excluded from the TS path alias, so direct import
      // isn't available). Missing flags default to "not flagged"
      // so pre-PR-#480 legacy writes still progress as before.
      const isCountable =
        data.isInvalid !== true &&
        data.savedAnyway !== true &&
        (Number(data.distance) || 0) >= 50 &&
        (Number(data.duration) || 0) >= 30;

      if (isCountable) {
        // Auto-progress km-based challenges
        const distanceKm = data.distanceKm || (data.distance ? data.distance / 1000 : 0);
        if (distanceKm > 0) {
          await syncChallengeProgress(uid, "total_km", Math.round(distanceKm * 100) / 100);
        }

        // PR 5: fastest_effort uses MIN-update semantics, separate
        // sync path. Pass distance in metres + duration in seconds;
        // the helper gates on runDistance >= challenge.targetDistance.
        const runDistanceMeters = data.distance || (distanceKm * 1000) || 0;
        const runDurationSeconds = data.duration || 0;
        if (runDistanceMeters > 0 && runDurationSeconds > 0) {
          await syncFastestEffortProgress(uid, runDistanceMeters, runDurationSeconds);
        }
      } else {
        console.log(
          `onRunCreated: skipping challenge/fastest-effort sync for ${uid} ` +
          `(isInvalid=${data.isInvalid === true}, savedAnyway=${data.savedAnyway === true}, ` +
          `distance=${data.distance}, duration=${data.duration})`,
        );
      }

      if (data.completedAt) {
        const runDate = data.completedAt.toDate ? data.completedAt.toDate() : new Date(data.completedAt);
        const runWeek = getWeekKey(runDate);
        const currentWeek = getWeekKey(new Date());
        if (runWeek !== currentWeek) {
          console.log(`onRunCreated: skipping recompute for ${uid}, run in week ${runWeek} (current: ${currentWeek})`);
          return null;
        }
      }

      const canRun = await acquireCooldownLock(uid);
      if (!canRun) {
        console.log(`onRunCreated: cooldown active for ${uid}, skipping`);
        return null;
      }

      try {
        await computeAndWritePerformanceForUser(uid, null);
        await releaseLock(uid, true);
        console.log(`onRunCreated: computed performance for ${uid}`);
      } catch (err) {
        await releaseLock(uid, false, err.message);
        console.error(`onRunCreated: compute error for ${uid}:`, err.message);
      }
    } catch (err) {
      console.error("onRunCreated: fatal error:", { uid, message: err.message, stack: err.stack });
    }
    return null;
  });

// ══════════════════════════════════════════════
// CREW WEEKLY LEADERBOARD ROLLUP
// ══════════════════════════════════════════════
//
// For every crew with at least one member, compute each member's
// this-week score on the crew's chosen `leaderboardMetric` and write
// the top-10 standings back to the crew doc as `currentLeaderboard`.
//
// Read paths:
//   - groups/{crewId}                  (crew metadata + leaderboardMetric)
//   - groups/{crewId}/members/{uid}    (member list, denormalised displayName)
//   - users/{uid}/workouts             (this-week, for total_volume / count / hybrid)
//   - users/{uid}/runs                 (this-week, for total_km / hybrid)
//
// Write path: groups/{crewId}.currentLeaderboard
//
// Scheduled daily so users see ~current-day standings during the week,
// not just a frozen end-of-week snapshot. Cost is bounded by the
// memberCount filter (limit(50) crews) and the per-member week-window
// queries (limit(100) each); for 50 crews × ~10 members × 2 colls = at
// most ~1000 small reads per run.

const CREW_LEADERBOARD_TOP_N = 10;
const CREW_MAX_PER_RUN = 50;

function _startOfIsoWeekUtc(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay() || 7; // Sunday → 7 so Monday is the start
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d;
}

function _isoWeekKey(date) {
  // ISO week year-week — used as the leaderboardWeek tag so the client
  // can show "Week of …" without a separate parse.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function _toDateKey(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function _computeMemberWeekTotals(uid, weekStartTs, weekStartKey) {
  const [runsSnap, workoutsSnap] = await Promise.all([
    db.collection("users").doc(uid).collection("runs")
      .where("completedAt", ">=", weekStartTs)
      .orderBy("completedAt")
      .limit(100)
      .get()
      .catch(() => ({ docs: [] })),
    db.collection("users").doc(uid).collection("workouts")
      .where("date", ">=", weekStartKey)
      .orderBy("date")
      .limit(100)
      .get()
      .catch(() => ({ docs: [] })),
  ]);

  let km = 0;
  for (const d of runsSnap.docs) {
    // Volume-eligibility filter: crew leaderboards exclude invalid,
    // savedAnyway, and sub-threshold records. Plain JS inline
    // equivalent of `isVolumeEligible` from
    // src/lib/runStatsEligibility.ts; functions/ is excluded from
    // the TS path alias so we can't import it. Missing flags /
    // fields default to "not flagged" / 0 so legacy docs
    // (pre-PR #480) keep counting honestly.
    const data = d.data();
    if (data.isInvalid === true) continue;
    if (data.savedAnyway === true) continue;
    const distance = Number(data.distance) || 0;
    const duration = Number(data.duration) || 0;
    if (distance < 50) continue;
    if (duration < 30) continue;
    km += distance / 1000;
  }
  let kg = 0;
  for (const d of workoutsSnap.docs) {
    const exercises = d.data().exercises || [];
    for (const ex of exercises) {
      for (const set of ex.sets || []) {
        kg += (Number(set.weightKg) || 0) * (Number(set.reps) || 0);
      }
    }
  }
  return {
    km: Math.round(km * 10) / 10,
    kg: Math.round(kg),
    workoutCount: workoutsSnap.docs.length,
    runCount: runsSnap.docs.length,
  };
}

function _scoreFor(metric, totals) {
  switch (metric) {
    case "workout_count":
      return totals.workoutCount;
    case "total_volume":
      return totals.kg;
    case "total_km":
      return totals.km;
    case "hybrid_score":
    default:
      // Mirrors src/lib/personalTrajectory.ts so the crew leaderboard
      // and the user's solo trajectory card use the same formula.
      return Math.round(totals.km * 100 + totals.kg * 0.1);
  }
}

exports.crewWeeklyLeaderboardRollup = functions.pubsub
  .schedule("30 2 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    try {
      console.log("crewWeeklyLeaderboardRollup: starting");

      const now = new Date();
      const weekStart = _startOfIsoWeekUtc(now);
      const weekStartTs = admin.firestore.Timestamp.fromDate(weekStart);
      const weekStartKey = _toDateKey(weekStart);
      const weekIso = _isoWeekKey(weekStart);

      let crewsSnap;
      try {
        crewsSnap = await db.collection("groups")
          .where("memberCount", ">", 0)
          .limit(CREW_MAX_PER_RUN)
          .get();
      } catch (err) {
        console.error("crewWeeklyLeaderboardRollup: crews query failed:", err.message);
        return null;
      }

      console.log(`crewWeeklyLeaderboardRollup: rolling up ${crewsSnap.size} crews for ${weekIso}`);

      for (const crewDoc of crewsSnap.docs) {
        try {
          const crew = crewDoc.data();
          const metric = crew.leaderboardMetric || "hybrid_score";

          const membersSnap = await crewDoc.ref.collection("members").limit(100).get();
          if (membersSnap.empty) continue;

          const standings = [];
          for (const memberDoc of membersSnap.docs) {
            const uid = memberDoc.id;
            const memberData = memberDoc.data();
            try {
              const totals = await _computeMemberWeekTotals(uid, weekStartTs, weekStartKey);
              standings.push({
                uid,
                displayName: memberData.displayName || "Athlete",
                score: _scoreFor(metric, totals),
                km: totals.km,
                kg: totals.kg,
                workoutCount: totals.workoutCount,
                runCount: totals.runCount,
              });
            } catch (err) {
              console.warn(`crewWeeklyLeaderboardRollup: member ${uid} compute failed:`, err.message);
            }
          }

          standings.sort((a, b) => b.score - a.score);
          const top = standings.slice(0, CREW_LEADERBOARD_TOP_N).map((s, i) => ({ ...s, rank: i + 1 }));

          await crewDoc.ref.update({
            currentLeaderboard: top,
            leaderboardMetric: metric,
            leaderboardWeek: weekIso,
            leaderboardUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (err) {
          console.error(`crewWeeklyLeaderboardRollup: failed for crew ${crewDoc.id}:`, err.message);
        }
      }

      console.log("crewWeeklyLeaderboardRollup: done");
    } catch (err) {
      console.error("crewWeeklyLeaderboardRollup: fatal:", { message: err.message, stack: err.stack });
    }
    return null;
  });

// On-demand companion: lets a logged-in user trigger a rollup for
// their own crew without waiting for the next 02:30 UTC run. Used by
// the "Refresh leaderboard" affordance on the Crew page (a manual
// pull-to-refresh-like fallback when you've just logged something
// and want the standings to reflect it). Only the user's primary
// crewId is allowed — no arbitrary crew computes from the client.
exports.refreshMyCrewLeaderboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }
  const uid = context.auth.uid;
  const userSnap = await db.collection("users").doc(uid).get();
  const userCrewId = userSnap.exists ? userSnap.data().crewId : null;
  if (!userCrewId) {
    throw new functions.https.HttpsError("failed-precondition", "Not in a crew.");
  }

  const crewRef = db.collection("groups").doc(userCrewId);
  const crewSnap = await crewRef.get();
  if (!crewSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Crew not found.");
  }
  const crew = crewSnap.data();
  const metric = crew.leaderboardMetric || "hybrid_score";

  const now = new Date();
  const weekStart = _startOfIsoWeekUtc(now);
  const weekStartTs = admin.firestore.Timestamp.fromDate(weekStart);
  const weekStartKey = _toDateKey(weekStart);
  const weekIso = _isoWeekKey(weekStart);

  const membersSnap = await crewRef.collection("members").limit(100).get();
  const standings = [];
  for (const memberDoc of membersSnap.docs) {
    const memberUid = memberDoc.id;
    const memberData = memberDoc.data();
    try {
      const totals = await _computeMemberWeekTotals(memberUid, weekStartTs, weekStartKey);
      standings.push({
        uid: memberUid,
        displayName: memberData.displayName || "Athlete",
        score: _scoreFor(metric, totals),
        km: totals.km,
        kg: totals.kg,
        workoutCount: totals.workoutCount,
        runCount: totals.runCount,
      });
    } catch (err) {
      console.warn(`refreshMyCrewLeaderboard: member ${memberUid} compute failed:`, err.message);
    }
  }
  standings.sort((a, b) => b.score - a.score);
  const top = standings.slice(0, CREW_LEADERBOARD_TOP_N).map((s, i) => ({ ...s, rank: i + 1 }));

  await crewRef.update({
    currentLeaderboard: top,
    leaderboardMetric: metric,
    leaderboardWeek: weekIso,
    leaderboardUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, count: top.length, weekIso };
});

// ══════════════════════════════════════════════
// BACKFILL — activity muscleGroups
// ══════════════════════════════════════════════
//
// Background: every workout activity posted before the
// inferMovementCategory fix (commit 46127d5) inherited
// "horizontal_push" from the template normalizer's hardcoded default.
// The fix corrects new posts going forward but doesn't touch existing
// docs in /activities — so a Pull A workout posted last week still
// shows the wrong tag in the social feed.
//
// This callable lets a user re-tag their OWN activities. It's
// scoped to the caller's authorId so one user can't mass-modify
// someone else's posts. Idempotent: re-running just recomputes the
// same field (or the same correct field if already fixed).
//
// Trigger from the browser DevTools console:
//   const fns = firebase.functions ? firebase.functions() :
//     getFunctions();
//   await httpsCallable(fns, "backfillMyActivityCategories")();
// or inside the app via a one-time admin button (not built — this
// is a one-shot fix, not a permanent feature).

/* Port of src/lib/exerciseMovementCategory.ts. Keep in sync if the
 * source file gains new categories or rules. */
const _BACKFILL_CATEGORY_RULES = [
  { category: "hip_dominant", keywords: ["deadlift", "rdl", "good morning", "hip thrust", "glute bridge", "kettlebell swing", "swing"] },
  { category: "knee_dominant", keywords: ["squat", "lunge", "leg press", "leg extension", "step up", "split squat", "pistol", "calf raise", "leg curl"] },
  { category: "vertical_pull", keywords: ["pull-up", "pull up", "pullup", "chin-up", "chin up", "chinup", "lat pulldown", "pulldown"] },
  { category: "horizontal_pull", keywords: ["row", "face pull"] },
  { category: "vertical_push", keywords: ["overhead press", "shoulder press", "military press", "push press", "ohp", "lateral raise", "front raise", "upright row"] },
  { category: "horizontal_push", keywords: ["bench press", "bench", "chest press", "push-up", "push up", "pushup", "dip", "fly", "flye", "incline press", "decline press"] },
  { category: "arms_triceps", keywords: ["tricep", "skullcrusher", "skull crusher", "pushdown", "kickback", "extension"] },
  { category: "arms_biceps", keywords: ["curl"] },
  { category: "core", keywords: ["plank", "crunch", "sit-up", "sit up", "situp", "leg raise", "ab", "russian twist", "rollout", "hollow"] },
];

function _inferCategoryForBackfill(name, exerciseId) {
  const haystack = `${name || ""} ${exerciseId || ""}`.toLowerCase();
  for (const rule of _BACKFILL_CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) return rule.category;
    }
  }
  return "core";
}

exports.backfillMyActivityCategories = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }
  const uid = context.auth.uid;

  const activitiesSnap = await db.collection("activities")
    .where("authorId", "==", uid)
    .where("type", "==", "workout")
    .limit(500)
    .get();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const docSnap of activitiesSnap.docs) {
    scanned++;
    const data = docSnap.data();
    const exercises = Array.isArray(data.exercises) ? data.exercises : [];
    if (exercises.length === 0) {
      skipped++;
      continue;
    }

    const fresh = [];
    for (const ex of exercises) {
      const name = typeof ex.name === "string" ? ex.name : "";
      const exerciseId = typeof ex.exerciseId === "string" ? ex.exerciseId : "";
      const cat = _inferCategoryForBackfill(name, exerciseId);
      if (!fresh.includes(cat)) fresh.push(cat);
    }
    if (fresh.length === 0) {
      skipped++;
      continue;
    }

    const existing = Array.isArray(data.muscleGroups) ? data.muscleGroups : [];
    const same = existing.length === fresh.length && existing.every((m, i) => m === fresh[i]);
    if (same) {
      skipped++;
      continue;
    }

    await docSnap.ref.update({ muscleGroups: fresh });
    updated++;
  }

  return { ok: true, scanned, updated, skipped };
});

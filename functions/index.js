const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// ══════════════════════════════════════════════
// RATE LIMITER — per-user, Firestore-backed
// ══════════════════════════════════════════════

/**
 * Checks if a user has exceeded the allowed number of calls within a window.
 * Uses a Firestore document to track timestamps.
 * @param {string} uid - User ID
 * @param {string} action - Action name (e.g., "askGemini", "analyzeFood")
 * @param {number} maxCalls - Maximum calls allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<boolean>} true if rate limited (should block)
 */
async function isRateLimited(uid, action, maxCalls, windowMs) {
  const rl = admin.firestore().collection("rateLimits").doc(`${uid}_${action}`);
  const now = Date.now();

  try {
    const doc = await rl.get();
    const data = doc.exists ? doc.data() : { timestamps: [] };
    // Filter to only timestamps within the window
    const recent = (data.timestamps || []).filter((t) => now - t < windowMs);

    if (recent.length >= maxCalls) {
      return true; // rate limited
    }

    // Record this call
    recent.push(now);
    await rl.set({ timestamps: recent, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return false;
  } catch (err) {
    console.error(`Rate limiter error for ${uid}/${action}:`, err.message);
    return false; // fail open — don't block on rate limiter errors
  }
}

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

      // Rate limit: 10 image analyses per 10 minutes
      const limited = await isRateLimited(authUser.uid, "analyzeFood", 10, 600_000);
      if (limited) {
        res.status(429).json({ error: "Rate limit reached. Please wait before analyzing more food." });
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

      // Rate limit: 15 text analyses per 10 minutes
      const limited = await isRateLimited(authUser.uid, "analyzeFoodText", 15, 600_000);
      if (limited) {
        res.status(429).json({ error: "Rate limit reached. Please wait before analyzing more food." });
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

      // Verify the user is authenticated
      const authUser = await verifyAuth(req.headers.authorization);
      if (authUser.uid !== uid) {
        res.status(403).json({ error: "UID mismatch" });
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
        mode: priceId.includes("lifetime") ? "payment" : "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { firebaseUid: uid },
      });

      res.status(200).json({ url: session.url });
    } catch (error) {
      console.error("createCheckoutSession error:", error.message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });
});

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
        };

        // For subscription mode, store the subscription ID
        if (session.subscription) {
          update.stripeSubscriptionId = session.subscription;
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
        const status = subscription.status;

        // Active statuses that grant pro access
        const activeStatuses = ["active", "trialing"];
        const tier = activeStatuses.includes(status) ? "pro" : "free";

        await userDoc.ref.set({
          subscriptionTier: tier,
          stripeSubscriptionId: subscription.id,
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
        await userDoc.ref.set({
          subscriptionTier: "free",
          stripeSubscriptionId: admin.firestore.FieldValue.delete(),
        }, { merge: true });

        console.log(`stripeWebhook: deactivated pro for ${userDoc.id}`);
        break;
      }

      default:
        console.log(`stripeWebhook: unhandled event type ${event.type}`);
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
      } catch (_) {
        console.log("weeklyPerformanceRollup: lastActiveAt query failed, computing for all users");
        usersSnap = await db.collection("users").get();
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

      await db.collection("users").doc(uid).set(
        { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      // Auto-progress km-based challenges
      const distanceKm = data.distanceKm || (data.distance ? data.distance / 1000 : 0);
      if (distanceKm > 0) {
        await syncChallengeProgress(uid, "total_km", Math.round(distanceKm * 100) / 100);
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

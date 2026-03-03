const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

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

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const token = authHeader.split("Bearer ")[1];
      await admin.auth().verifyIdToken(token);

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
    return null;
  });

// ── 3) Scheduled: daily refresh (02:10 UTC) ──

exports.dailyPerformanceRefresh = functions.pubsub
  .schedule("10 2 * * *")
  .timeZone("Europe/London")
  .onRun(async () => {
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
    return null;
  });

// ── 4) Trigger: instant recompute on new workout ──

exports.onWorkoutCreated = functions.firestore
  .document("users/{uid}/workouts/{workoutId}")
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
    const data = snap.data();

    await db.collection("users").doc(uid).set(
      { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

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
      console.error(`onWorkoutCreated: error for ${uid}:`, err.message);
    }
    return null;
  });

// ── 5) Trigger: instant recompute on new run ──

exports.onRunCreated = functions.firestore
  .document("users/{uid}/runs/{runId}")
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
    const data = snap.data();

    await db.collection("users").doc(uid).set(
      { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

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
      console.error(`onRunCreated: error for ${uid}:`, err.message);
    }
    return null;
  });

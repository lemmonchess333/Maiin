/**
 * Rate limiter — extracted from index.js into an importable module so
 * integration tests can drive it against the Firestore emulator without
 * pulling in the rest of index.js (CORS, cloud-functions exports, etc.).
 *
 * `isRateLimited` takes a `db` (firebase-admin Firestore instance) as its
 * first argument so the caller controls which project / emulator they
 * target. index.js wraps it with the production `admin.firestore()`
 * instance; tests pass an emulator-bound instance.
 *
 * `checkMonthlyQuota` and its `SCAN_LIMITS` table used to live here too.
 * Both were dead — the daily per-action quota in `lib/aiScanQuota.js`
 * (F1b) is what gates the AI endpoints. Deleting them also removed a
 * hazard: that function wrote `scanUsage/{uid}` with a NON-merging
 * `tx.set` in the old `{ count, month }` shape, which is the same
 * document the daily quota keeps `text_ai` / `image_ai` counters in. Any
 * future call site would have silently wiped a user's daily counters.
 */

const { pruneOldTimestamps } = require("./helpers");
const admin = require("firebase-admin");

/**
 * Checks whether a user has exceeded `maxCalls` within `windowMs`.
 * Uses a Firestore transaction so concurrent requests cannot both
 * observe `recent.length === maxCalls - 1` and both succeed (audit
 * P0 #1 race window).
 *
 * Fail-closed: a transaction error returns `true` (rate limited).
 * The rate limiter gates cost-sensitive AI invocations; a transient
 * Firestore error must never silently grant unlimited paid calls.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {string} action
 * @param {number} maxCalls
 * @param {number} windowMs
 * @returns {Promise<boolean>} true if rate-limited (should block)
 */
async function isRateLimited(db, uid, action, maxCalls, windowMs) {
  const rl = db.collection("rateLimits").doc(`${uid}_${action}`);
  const now = Date.now();
  try {
    return await db.runTransaction(async (tx) => {
      const doc = await tx.get(rl);
      const data = doc.exists ? doc.data() : { timestamps: [] };
      const recent = pruneOldTimestamps(data.timestamps, now, windowMs);
      if (recent.length >= maxCalls) return true;
      recent.push(now);
      const trimmed = recent.slice(-maxCalls);
      tx.set(rl, {
        timestamps: trimmed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return false;
    });
  } catch (err) {
    console.error(`Rate limiter error for ${uid}/${action}:`, err.message);
    return true;
  }
}

module.exports = {
  isRateLimited,
};

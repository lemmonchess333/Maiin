/**
 * Rate limiter + monthly quota — extracted from index.js into an
 * importable module so integration tests can drive them against the
 * Firestore emulator without pulling in the rest of index.js (CORS,
 * cloud-functions exports, etc.).
 *
 * Both helpers take a `db` (firebase-admin Firestore instance) as
 * their first argument so the caller controls which project /
 * emulator they target. index.js wraps each with the production
 * `admin.firestore()` instance; tests pass an emulator-bound
 * instance.
 */

const { pruneOldTimestamps, computeEffectiveTier, currentMonthCount } = require("./helpers");
const admin = require("firebase-admin");

const SCAN_LIMITS = { free: 10, pro: 300 };

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

/**
 * Atomically check + increment a user's monthly AI scan counter.
 * Same race-safe transaction shape as isRateLimited. Returns the
 * decision plus the remaining count + the applicable limit so
 * the caller can surface usage to the user.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number, error?: string}>}
 */
async function checkMonthlyQuota(db, uid) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const userRef = db.collection("users").doc(uid);
  const usageRef = db.collection("scanUsage").doc(uid);
  try {
    return await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const effectiveTier = computeEffectiveTier(
        userSnap.exists ? userSnap.data() : null,
      );
      const limit = SCAN_LIMITS[effectiveTier];
      const usageSnap = await tx.get(usageRef);
      const count = currentMonthCount(
        usageSnap.exists ? usageSnap.data() : null,
        currentMonth,
      );
      if (count >= limit) {
        return { allowed: false, remaining: 0, limit };
      }
      tx.set(usageRef, {
        count: count + 1,
        month: currentMonth,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { allowed: true, remaining: limit - count - 1, limit };
    });
  } catch (err) {
    console.error(`Quota check error for ${uid}:`, err.message);
    return {
      allowed: false,
      remaining: 0,
      limit: SCAN_LIMITS.free,
      error: "quota-check-failed",
    };
  }
}

module.exports = {
  isRateLimited,
  checkMonthlyQuota,
  SCAN_LIMITS,
};

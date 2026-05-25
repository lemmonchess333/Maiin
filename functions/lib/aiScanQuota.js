/**
 * F1b — daily-windowed AI scan quota with per-action counters.
 *
 * Locked design (Sub1 row F1b → B+C hybrid, see plan file):
 *
 *   action     | free / day | pro / day | Notes
 *   -----------|------------|-----------|----------------------------------
 *   text_ai    | 10         | 100       | Pro user-facing copy says
 *               |            |           | "unlimited"; 100 is the
 *               |            |           | server-side abuse-protection cap.
 *   image_ai   | 0          | 100       | Image-AI is Pro-only (free=0).
 *
 * Window: 24 h, anchored to the user's LOCAL midnight when a
 * `timezone` field is set on the user doc (IANA name, e.g.
 * "Europe/London"), else UTC fallback. The window-key is the date
 * portion (`YYYY-MM-DD`) in the resolved zone; the counter resets
 * when the resolved date string changes.
 *
 * Trial bypass: `computeEffectiveTier` returns "pro" while the
 * trial is active (Sub1a P1 maps Stripe `trialing` → `subscriptionTier: "pro"`),
 * so trialing users hit the Pro limits without an extra branch here.
 *
 * Storage: `scanUsage/{uid}` doc, shape
 *   {
 *     text_ai:  { day: "YYYY-MM-DD", count: number },
 *     image_ai: { day: "YYYY-MM-DD", count: number },
 *     timezone: "Europe/London" | null,
 *     updatedAt: serverTimestamp,
 *   }
 *
 * Old shape `{ count, month }` (pre-F1b monthly counter) is read as
 * count=0 — equivalent to no usage today. Legacy users get a
 * fresh window on their first post-F1b call; no migration script
 * needed.
 *
 * Pinned-by-test invariants live in `__tests__/aiScanQuota.test.js`.
 */

const admin = require("firebase-admin");
const { computeEffectiveTier } = require("./../helpers");

const ACTION_TEXT_AI = "text_ai";
const ACTION_IMAGE_AI = "image_ai";

const VALID_ACTIONS = Object.freeze([ACTION_TEXT_AI, ACTION_IMAGE_AI]);

const DAILY_LIMITS = Object.freeze({
  free: { text_ai: 10, image_ai: 0 },
  pro: { text_ai: 100, image_ai: 100 },
});

/**
 * Resolve the "today" key in the user's local timezone. The string
 * is just a stable bucket identifier — no time arithmetic depends
 * on it being parseable.
 *
 * - Valid IANA timezone: format `YYYY-MM-DD` in that zone via
 *   Intl.DateTimeFormat with `timeZone` option.
 * - Missing / invalid timezone: fall back to UTC. UTC is the
 *   defence-in-depth choice — a misconfigured profile shouldn't
 *   gift the user a free window-rollover by accident.
 */
function resolveDayKey(timezone, now = new Date()) {
  try {
    if (timezone && typeof timezone === "string") {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      // en-CA produces YYYY-MM-DD natively.
      return fmt.format(now);
    }
  } catch (_) {
    // Fall through to UTC. Intl.DateTimeFormat throws RangeError
    // on unknown IANA names — that's the only case we need to
    // handle; everything else surfaces as "Invalid Date".
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Atomic check-and-increment against the daily counter for one
 * action. Returns the decision plus the remaining count + the
 * applicable limit so the caller can surface usage to the user.
 *
 * Fail-closed: any transaction error returns `{ allowed: false,
 * error: "quota-check-failed" }` so the caller can either retry or
 * surface a transient-error message. Granting a free Pro call on a
 * transient Firestore blip would defeat the cost guardrail.
 */
async function checkDailyAiQuota(db, { uid, action, now = new Date() } = {}) {
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(
      `checkDailyAiQuota: action must be one of ${VALID_ACTIONS.join("|")}, got ${JSON.stringify(action)}`,
    );
  }

  const userRef = db.collection("users").doc(uid);
  const usageRef = db.collection("scanUsage").doc(uid);

  try {
    return await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.exists ? userSnap.data() : null;
      const tier = computeEffectiveTier(userData, now);
      const limit = DAILY_LIMITS[tier][action];

      // Free user attempting image_ai: limit is 0 — hard block.
      // No write (no counter to increment) so abuse can't even
      // crowd the doc.
      if (limit === 0) {
        return { allowed: false, remaining: 0, limit, tier };
      }

      const dayKey = resolveDayKey(userData?.timezone, now);
      const usageSnap = await tx.get(usageRef);
      const usageData = usageSnap.exists ? usageSnap.data() : {};
      const actionState = usageData[action];
      // New day OR no prior state OR legacy {count, month} shape.
      const sameDay =
        actionState &&
        typeof actionState === "object" &&
        actionState.day === dayKey;
      const count = sameDay && typeof actionState.count === "number"
        ? actionState.count
        : 0;

      if (count >= limit) {
        return { allowed: false, remaining: 0, limit, tier };
      }

      const nextActionState = { day: dayKey, count: count + 1 };
      tx.set(
        usageRef,
        {
          [action]: nextActionState,
          timezone: userData?.timezone ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return {
        allowed: true,
        remaining: limit - count - 1,
        limit,
        tier,
      };
    });
  } catch (err) {
    // Cloud Logging via console.error keeps parity with the
    // pre-F1b helper's failure path.
    console.error(`checkDailyAiQuota error for ${uid}/${action}:`, err.message);
    return {
      allowed: false,
      remaining: 0,
      limit: DAILY_LIMITS.free[action],
      tier: "free",
      error: "quota-check-failed",
    };
  }
}

module.exports = {
  ACTION_TEXT_AI,
  ACTION_IMAGE_AI,
  VALID_ACTIONS,
  DAILY_LIMITS,
  resolveDayKey,
  checkDailyAiQuota,
};

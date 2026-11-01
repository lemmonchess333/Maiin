/**
 * F1b — daily-windowed AI scan quota with per-action counters.
 *
 * Locked design (Sub1 row F1b → B+C hybrid, see plan file):
 *
 *   action     | free / day | pro / day | Notes
 *   -----------|------------|-----------|----------------------------------
 *   text_ai    | 0          | 100       | 100 is the server-side
 *               |            |           | abuse-protection cap.
 *   image_ai   | 0          | 100       | Image-AI is Pro-only (free=0).
 *
 * The free plan has no AI: Apple's 7-day trial is how someone tries it.
 *
 * Window: the UTC day. The key is the UTC date (`YYYY-MM-DD`), and the
 * counter resets when it changes, at 00:00 UTC for everyone. Not the
 * person's own midnight: the only zone the server has is `timezone` on
 * the user doc, which the client writes, so a quota keyed on it would
 * start a fresh day whenever the client changed zone (Pacific/Kiritimati
 * and Pacific/Pago_Pago never share a date). The cost is that the count
 * starts again at a local time that is not midnight for most people, so
 * the app names that time where it shows the count
 * (src/lib/scanQuotaDay.ts).
 *
 * Trial bypass: `computeEffectiveTier` returns "pro" while the
 * trial is active (Sub1a P1 maps Stripe `trialing` → `subscriptionTier: "pro"`),
 * so trialing users hit the Pro limits without an extra branch here.
 *
 * Storage: `scanUsage/{uid}` doc, shape
 *   {
 *     text_ai:  { day: "YYYY-MM-DD", count: number },  // UTC day
 *     image_ai: { day: "YYYY-MM-DD", count: number },
 *     updatedAt: serverTimestamp,
 *   }
 * (Older documents also carry a `timezone`, which nothing reads.)
 *
 * Old shape `{ count, month }` (pre-F1b monthly counter) is read as
 * count=0 — equivalent to no usage today. Legacy users get a
 * fresh window on their first post-F1b call; no migration script
 * needed.
 *
 * Mirror discipline (ADR-0008): `DAILY_LIMITS` below mirrors
 * src/lib/subscription.ts `DAILY_AI_LIMITS`, and this is the copy that
 * ACTUALLY allows or denies a scan — the client copy only decides whether
 * to render the Scan-Meal CTA or an upgrade prompt. Pinned byte-identical
 * by src/lib/__tests__/aiScanQuota.parity.cross.test.ts. `quotaDayKey`
 * mirrors src/lib/scanQuotaDay.ts `scanQuotaDayKey`, which the client
 * reads the count by; the same cross-test pins the two to one day.
 *
 * That cross-test existed for months before this paragraph did, and the
 * mirror gate could not see it: the declaration lived only on the CLIENT
 * side, and the gate scans the functions tree. A mirror is a relation
 * between two files, so whichever end a reader arrives from has to be able
 * to find the other — hence the declaration on both.
 *
 * Pinned-by-test invariants live in `__tests__/aiScanQuota.test.js`.
 */

const admin = require("firebase-admin");
const { computeEffectiveTier } = require("./../helpers");
const { utcDateString } = require("./dateUtils");

const ACTION_TEXT_AI = "text_ai";
const ACTION_IMAGE_AI = "image_ai";

const VALID_ACTIONS = Object.freeze([ACTION_TEXT_AI, ACTION_IMAGE_AI]);

const DAILY_LIMITS = Object.freeze({
  free: { text_ai: 0, image_ai: 0 },
  pro: { text_ai: 100, image_ai: 100 },
});

/** The day a scan counts against: the UTC date at `now`. See the header. */
function quotaDayKey(now = new Date()) {
  return utcDateString(now);
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
      `checkDailyAiQuota: action must be one of ${VALID_ACTIONS.join("|")}, got ${JSON.stringify(action)}`
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

      const dayKey = quotaDayKey(now);
      const usageSnap = await tx.get(usageRef);
      const usageData = usageSnap.exists ? usageSnap.data() : {};
      const actionState = usageData[action];
      // New day OR no prior state OR legacy {count, month} shape.
      const sameDay =
        actionState &&
        typeof actionState === "object" &&
        actionState.day === dayKey;
      const count =
        sameDay && typeof actionState.count === "number"
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        allowed: true,
        remaining: limit - count - 1,
        limit,
        tier,
        // The day this scan was counted against, for a refund.
        dayKey,
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

/**
 * Give back a scan the service failed, not the person: the model answered
 * 429 (busy) or 5xx, or with nothing that could be read. Before, that cost
 * the day's scan all the same, and a free account has one. A 4xx the
 * request caused keeps the charge, so a bad request cannot be retried for
 * free. Never throws: the refund is not the response.
 */
function isServiceFailure(modelStatus) {
  return modelStatus === undefined || modelStatus === 429 || modelStatus >= 500;
}

async function refundDailyAiQuota(db, { uid, action, dayKey } = {}) {
  if (!uid || !VALID_ACTIONS.includes(action) || !dayKey) return false;
  const usageRef = db.collection("scanUsage").doc(uid);
  try {
    return await db.runTransaction(async (tx) => {
      const usage = await tx.get(usageRef);
      const state = usage.exists ? usage.data()[action] : null;
      if (
        !state ||
        state.day !== dayKey ||
        typeof state.count !== "number" ||
        state.count <= 0
      )
        return false;
      tx.set(
        usageRef,
        { [action]: { day: dayKey, count: state.count - 1 } },
        { merge: true }
      );
      return true;
    });
  } catch (err) {
    console.error(
      `refundDailyAiQuota error for ${uid}/${action}:`,
      err.message
    );
    return false;
  }
}

/** What the person is told when the scan failed after it was counted. */
function failedScanResponse(modelStatus) {
  if (modelStatus === 429) {
    return {
      status: 503,
      body: {
        error: "ai-busy",
        message:
          "Food analysis is busy right now. Try again in a minute. This one didn't use a scan.",
      },
    };
  }
  return {
    status: 500,
    body: isServiceFailure(modelStatus)
      ? {
          error: "ai-failed",
          message:
            "Couldn't analyse this. Try again. This one didn't use a scan.",
        }
      : { error: "ai-failed", message: "Couldn't analyse this. Try again." },
  };
}

module.exports = {
  isServiceFailure,
  refundDailyAiQuota,
  failedScanResponse,
  ACTION_TEXT_AI,
  ACTION_IMAGE_AI,
  VALID_ACTIONS,
  DAILY_LIMITS,
  quotaDayKey,
  checkDailyAiQuota,
};

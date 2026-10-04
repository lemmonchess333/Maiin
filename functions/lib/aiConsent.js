/**
 * Permission before food goes to AI (App Review Guideline 5.1.2(i)).
 *
 * `users/{uid}.aiAnalysisEnabled` holds the person's answer: undefined
 * (not asked yet), true (allowed) or false (off). analyzeFood and
 * analyzeFoodText refuse an account whose answer is `false`, before the
 * kill switch, the rate limit and the quota, so a refusal costs the person
 * nothing and nothing reaches Vertex AI.
 *
 * Undefined is let through. A client from before the question existed
 * never asks it, and refusing those clients would take scanning away from
 * people who were never offered the choice; the current client asks before
 * it sends anything, so for it undefined never reaches here with a request.
 *
 * The refusal is `failed-precondition` with a stable reason the client
 * maps to a plain message. These are onRequest endpoints, so it is sent as
 * HTTP 400, the status Firebase gives failed-precondition on a callable.
 *
 * Mirrors src/lib/aiConsent.ts: the client copy decides whether to send,
 * this one whether to answer, and both read the same stored value the
 * same way. Pinned by src/lib/__tests__/aiConsent.cross.test.ts.
 */

const AI_ANALYSIS_DISABLED = "ai-analysis-disabled";

const AI_ANALYSIS_DISABLED_MESSAGE =
  "AI food analysis is off for this account. You can turn it on in " +
  "Settings › Social & privacy.";

/** True when the stored answer is an explicit no. */
function aiAnalysisRefused(userData) {
  return Boolean(userData) && userData.aiAnalysisEnabled === false;
}

/**
 * Reads the account's answer. Fails closed: when the read fails nothing is
 * sent to Google, and the caller answers with a transient error the client
 * can retry, as the scan quota does.
 *
 * @returns {Promise<{allowed: true} | {allowed: false, reason?: string, error?: string}>}
 */
async function checkAiAnalysisConsent(db, uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    return aiAnalysisRefused(data)
      ? { allowed: false, reason: AI_ANALYSIS_DISABLED }
      : { allowed: true };
  } catch (err) {
    console.error(
      `checkAiAnalysisConsent error for ${uid}:`,
      err && err.message,
    );
    return { allowed: false, error: "consent-check-failed" };
  }
}

/**
 * For the onRequest AI endpoints: sends the refusal and returns true when
 * the account may not use AI analysis, else returns false and sends
 * nothing.
 */
async function refuseUnlessAiAllowed(db, uid, res) {
  const consent = await checkAiAnalysisConsent(db, uid);
  if (consent.allowed) return false;
  if (consent.error) {
    res.status(503).json({
      error: "Couldn't check your AI settings. Please try again in a moment.",
      transient: true,
    });
    return true;
  }
  res.status(400).json({
    error: AI_ANALYSIS_DISABLED_MESSAGE,
    code: "failed-precondition",
    reason: AI_ANALYSIS_DISABLED,
  });
  return true;
}

module.exports = {
  AI_ANALYSIS_DISABLED,
  AI_ANALYSIS_DISABLED_MESSAGE,
  aiAnalysisRefused,
  checkAiAnalysisConsent,
  refuseUnlessAiAllowed,
};

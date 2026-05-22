/**
 * R1A-Deletion — server-side recent-auth enforcement.
 *
 * Why this exists:
 *   getIdToken(true) on the client refreshes the Firebase ID token
 *   but does NOT update the auth_time claim or prove the user
 *   recently re-entered credentials. A valid-but-old session token
 *   (e.g. a 30-day-old session that auto-refreshed daily) would
 *   otherwise let deleteMyAccount drive Admin SDK Auth deletion
 *   without recent reauthentication.
 *
 *   Firebase's client-side `requires-recent-login` check protects
 *   client-driven user.delete() — but our deletion path uses the
 *   Admin SDK on the server, which bypasses that check entirely.
 *   The callable itself MUST inspect auth_time and reject stale
 *   sessions, otherwise we have a security defect: any valid-token
 *   compromise grants account deletion authority.
 *
 * Contract:
 *   assertRecentAuth(context) reads context.auth.token.auth_time
 *   (Unix seconds, when the user last entered credentials), compares
 *   to now, and throws an https.HttpsError with code 'failed-precondition'
 *   and a stable error code 'requires-recent-auth' if the threshold
 *   is exceeded.
 *
 * Threshold:
 *   5 minutes (300 seconds). Long enough that the typical reauth →
 *   open-modal → confirm-delete → callable round-trip succeeds without
 *   re-prompting; short enough that a stolen valid token isn't
 *   useful unless captured immediately after a fresh sign-in.
 *
 * Chunk 1 scope: full implementation (pure function + Firebase error
 * shape). Wiring into deleteMyAccount + cancelDeletionRequest happens
 * in Chunk 3.
 */
"use strict";

const RECENT_AUTH_MAX_AGE_SECONDS = 300; // 5 minutes

/**
 * Shape-compatible HttpsError factory. The real firebase-functions
 * import is used by callers; this helper exists so the assertion can
 * be unit-tested without booting the SDK.
 */
function makeRequiresRecentAuthError(message) {
  const err = new Error(message);
  err.code = "failed-precondition";
  err.errorCode = "requires-recent-auth";
  err.httpsErrorCode = "failed-precondition";
  return err;
}

/**
 * Pure check: returns null if recent, otherwise the error object.
 * Extracted so unit tests can pin the exact threshold/edge-case
 * behaviour without mocking the entire context.
 *
 * @param {number} authTimeSeconds Unix seconds — context.auth.token.auth_time
 * @param {number} nowSeconds Unix seconds — Date.now() / 1000 by default
 * @param {number} thresholdSeconds Override for tests
 */
function checkRecentAuth(
  authTimeSeconds,
  nowSeconds,
  thresholdSeconds = RECENT_AUTH_MAX_AGE_SECONDS,
) {
  if (typeof authTimeSeconds !== "number" || authTimeSeconds <= 0) {
    return makeRequiresRecentAuthError(
      "Recent reauthentication required: no auth_time claim on token.",
    );
  }
  const ageSeconds = nowSeconds - authTimeSeconds;
  if (ageSeconds > thresholdSeconds) {
    return makeRequiresRecentAuthError(
      `Recent reauthentication required: session is ${ageSeconds}s old, max ${thresholdSeconds}s.`,
    );
  }
  return null;
}

/**
 * Callable-context assertion. Throws an HttpsError-shaped error if
 * the caller's session is stale.
 *
 * Usage in Chunk 3 will look like:
 *   const { HttpsError } = require('firebase-functions/v1/https');
 *   const { assertRecentAuth } = require('./lib/accountDeletionAuth');
 *   exports.deleteMyAccount = functions.https.onCall(async (data, context) => {
 *     if (!context.auth) throw new HttpsError('unauthenticated', '...');
 *     assertRecentAuth(context); // throws requires-recent-auth on stale
 *     ...
 *   });
 */
function assertRecentAuth(context, nowFn) {
  const authTime = context && context.auth && context.auth.token && context.auth.token.auth_time;
  const nowSeconds = (nowFn || (() => Math.floor(Date.now() / 1000)))();
  const err = checkRecentAuth(authTime, nowSeconds);
  if (err) throw err;
}

module.exports = {
  RECENT_AUTH_MAX_AGE_SECONDS,
  checkRecentAuth,
  assertRecentAuth,
  makeRequiresRecentAuthError,
};

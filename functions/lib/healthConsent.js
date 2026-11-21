/**
 * Agreement before Tropos stores health details (Priv1 call 1, owner
 * 2026-11-21): the server's half.
 *
 * `users/{uid}.healthDataConsent` = `{ at, version }`. Setup asks before
 * its first body question, and `completeOnboarding` refuses to finish
 * setup without the answer: it must arrive as `healthDataConsent:
 * { version }` beside the plan, for the wording the app asks now. The
 * callable then stamps the time itself, so the date on the account is the
 * server's, never the device's. The refusal is `failed-precondition` with
 * a sentence for the person, which the app shows as it is; the current app
 * cannot reach it (setup's last step waits for the agreement), so it is
 * met only by a build from before the question existed, or a direct call.
 *
 * An account set up before the question is asked once on its next open,
 * and agreeing there is a client write that firestore.rules hold to
 * `{ at: request.time, version: 1 }`.
 *
 * Mirrors src/lib/healthConsent.ts: both read a stored answer the same way
 * (a whole-number version at or above the current one; `at` is not read,
 * since a write made offline holds it as null on the device until the
 * server stamps it). Pinned by src/lib/__tests__/healthConsent.cross.test.ts.
 */

const HEALTH_DATA_CONSENT_VERSION = 1;

const HEALTH_CONSENT_REQUIRED = "health-consent-required";

const HEALTH_CONSENT_REQUIRED_MESSAGE =
  "Agree to Tropos storing your health details to finish setting up. " +
  "If setup didn’t ask you, update Tropos and try again.";

/** Whether a stored `healthDataConsent` agrees to the current wording or a
 *  later one. */
function hasCurrentHealthConsent(value) {
  if (typeof value !== "object" || value === null) return false;
  const version = value.version;
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= HEALTH_DATA_CONSENT_VERSION
  );
}

/** Whether setup's `healthDataConsent` argument is an agreement to the
 *  wording this server knows. An older wording, a newer one it has not
 *  heard of, or anything else is refused. */
function setupConsentAccepted(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.version === HEALTH_DATA_CONSENT_VERSION
  );
}

/** Throws the refusal unless setup sent the agreement. */
function assertSetupHealthConsent(value, HttpsError) {
  if (setupConsentAccepted(value)) return;
  throw new HttpsError("failed-precondition", HEALTH_CONSENT_REQUIRED_MESSAGE, {
    reason: HEALTH_CONSENT_REQUIRED,
  });
}

/** The record setup stores, with the server's time. */
function healthConsentRecord(serverTimestamp) {
  return { at: serverTimestamp, version: HEALTH_DATA_CONSENT_VERSION };
}

module.exports = {
  HEALTH_DATA_CONSENT_VERSION,
  HEALTH_CONSENT_REQUIRED,
  HEALTH_CONSENT_REQUIRED_MESSAGE,
  hasCurrentHealthConsent,
  setupConsentAccepted,
  assertSetupHealthConsent,
  healthConsentRecord,
};

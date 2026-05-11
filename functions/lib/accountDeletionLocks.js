/**
 * R1A-Deletion Chunk 2 — callable / system-writer lock wrappers.
 *
 * Thin HttpsError-converting wrappers over functions/lib/accountDeletionStatus.js.
 * Pure status assertions throw plain Error objects with a stable
 * `.errorCode` field; these wrappers convert those to firebase-functions
 * HttpsError so the client receives a structured error response.
 *
 * Three wrappers:
 *   - assertCallableActorNotDeleting(db, uid)
 *       Use at the entry of any callable that writes user data.
 *       Rejects with HttpsError('failed-precondition', errorCode:
 *       'account-deleting') when the actor's deletion is active.
 *
 *   - assertCallableReferencedUidsNotDeleting(db, uids)
 *       Use INSIDE a transaction for callables that create cross-user
 *       references (comment authorId, kudos giver, follow target,
 *       notification recipient). The transactional placement closes
 *       TOCTOU windows.
 *
 *   - assertSystemWriterCanWrite(db, uid, reason)
 *       Use immediately before each write commit in webhooks /
 *       Firestore triggers / scheduled functions. Throws a plain
 *       Error (not HttpsError) — system writers don't return errors
 *       to clients, they log and either skip or quarantine.
 *
 * Exempt callsites:
 *   - deleteMyAccount and cancelDeletionRequest themselves — these
 *     ARE the deletion-control callables, and must bypass the actor
 *     lock to operate on a deleting account.
 *   - Read-only callables — no write means no lock needed.
 */
"use strict";

const functions = require("firebase-functions");
const status = require("./accountDeletionStatus");

/**
 * Convert an internal deletion-status error into a firebase-functions
 * HttpsError preserving the stable errorCode field on the details
 * payload. Other errors re-thrown unchanged.
 */
function wrapAsHttpsError(err) {
  if (!err || !err.errorCode) return err;
  return new functions.https.HttpsError(
    err.code || "failed-precondition",
    err.message,
    {
      errorCode: err.errorCode,
      uid: err.uid,
      referencedUid: err.referencedUid,
    },
  );
}

async function assertCallableActorNotDeleting(db, uid) {
  try {
    await status.assertAccountNotDeleting(db, uid);
  } catch (err) {
    const wrapped = wrapAsHttpsError(err);
    if (wrapped !== err) throw wrapped;
    throw err;
  }
}

async function assertCallableReferencedUidsNotDeleting(db, uids) {
  try {
    await status.assertNoReferencedAccountsDeleting(db, uids);
  } catch (err) {
    const wrapped = wrapAsHttpsError(err);
    if (wrapped !== err) throw wrapped;
    throw err;
  }
}

/**
 * System-writer guard: returns true if write should proceed, false if
 * it should be skipped. Logs the skip reason at info level (not error)
 * so legitimate skips don't blow up monitoring.
 *
 * Webhook handlers ALSO have a path to write to paymentEventsPostDeletion
 * when this returns false — that's the operator-reviewable log. See
 * functions/index.js stripeWebhook and functions/appleIAP.js
 * appleIAPWebhook for the consume pattern.
 */
async function shouldSystemWriteProceed(db, uid, reason) {
  if (!uid) return true; // no target uid = nothing to protect
  try {
    await status.assertUserWritableBySystem(db, uid, reason);
    return true;
  } catch (err) {
    if (err.errorCode === status.ERROR_CODES.SYSTEM_WRITE_BLOCKED) {
      // eslint-disable-next-line no-console
      console.info(
        `[R1A] system write skipped for uid=${uid} (kind=${err.kind}, reason=${reason})`,
      );
      return false;
    }
    throw err;
  }
}

/**
 * Record a minimised payment-event log entry for an event that arrived
 * for a deleting / tombstoned uid. Strict allowlist enforced via
 * assertPaymentEventShape; assertNoForbiddenFields is the defence-in-depth.
 *
 * Callers should pass the raw uid; this helper hashes it into the
 * 8-char prefix for the operator-reviewable log so the raw uid is not
 * persisted on the public-ish event log.
 *
 * @param db Admin SDK Firestore
 * @param event { provider, externalTxnId, eventType, uid }
 */
async function recordPaymentEventPostDeletion(db, event) {
  const minimisation = require("./accountDeletionMinimisation");
  const record = {
    provider: event.provider,
    externalTxnId: event.externalTxnId,
    eventType: event.eventType,
    occurredAt: Date.now(),
    hashedUidPrefix: minimisation.hashedUidPrefix(event.uid || ""),
    action: "logged",
  };
  minimisation.assertPaymentEventShape(record);
  await db.collection("paymentEventsPostDeletion").add(record);
}

module.exports = {
  wrapAsHttpsError,
  assertCallableActorNotDeleting,
  assertCallableReferencedUidsNotDeleting,
  shouldSystemWriteProceed,
  recordPaymentEventPostDeletion,
};

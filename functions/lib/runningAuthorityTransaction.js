/**
 * Acceptance stays inactive until immutable server preview creation,
 * complete revision participation, enrollment, client read gating and real
 * emulator validation are implemented. Callable transport is installed but defaults off.
 */
"use strict";

// Dormant adapter. Deliberately NOT exported from index.js or reachable by a
// client. Before activation: rate limit/App Check, domain preview creation,
// enrollment, revision participation of all writers and client read gating.
const functions = require("firebase-functions/v1");
const { applyRunningProposal, RunningAuthorityError } = require("./runningAuthority");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");

function identifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function acceptanceRequest(data, context) {
  if (!context?.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  const uid = context.auth.uid;
  if (!data || data.expectedUid !== uid)
    throw new functions.https.HttpsError("cancelled", "Running review belongs to another account.");
  const keys = ["expectedUid", "accepted", "proposalId", "expectedRevision", "idempotencyKey"];
  if (!identifier(uid) || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).some(key => !keys.includes(key)) || data.accepted !== true ||
      !identifier(data.proposalId) || !identifier(data.idempotencyKey) ||
      !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0)
    throw new functions.https.HttpsError("invalid-argument", "Invalid running acceptance.");
  return { uid, accepted: true, proposalId: data.proposalId,
    expectedRevision: data.expectedRevision, idempotencyKey: data.idempotencyKey };
}

async function acceptRunningProposalTransaction({ firestore, context, data, clock = Date.now }) {
  // Derive identity from auth and bind the account before constructing any ref.
  // Copy primitives once: request mutation cannot change a contention retry.
  const request = acceptanceRequest(data, context);
  const uid = request.uid;
  const user = firestore.doc(`users/${uid}`);
  const authority = firestore.collection("users").doc(uid).collection("runningState").doc("current");
  const proposal = firestore.collection("users").doc(uid).collection("runningProposals").doc(request.proposalId);
  const receipt = firestore.collection("users").doc(uid).collection("runningReceipts").doc(request.idempotencyKey);
  const deletion = firestore.collection(ledger.COLLECTION).doc(uid);
  const tombstone = firestore.collection(tombstones.COLLECTION).doc(uid);
  try {
    return await firestore.runTransaction(async tx => {
      const [userSnap, authoritySnap, proposalSnap, receiptSnap, deletionSnap, tombstoneSnap] =
        await Promise.all([user, authority, proposal, receipt, deletion, tombstone].map(ref => tx.get(ref)));
      // Re-evaluate server time AFTER the reads on EVERY retry. A contended
      // transaction must not accept an expired preview using its start time.
      const nowMs = clock();
      if (!Number.isSafeInteger(nowMs) || nowMs < 0)
        throw new functions.https.HttpsError("internal", "Invalid server clock.");
      // Deletion and existence checks precede replay too. No success response
      // or data resurrection for an account being erased.
      if (deletionSnap.exists && status.isStatusActive(deletionSnap.data().status))
        throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
      if (tombstoneSnap.exists && status.isTombstoneLive(tombstoneSnap.data(), nowMs))
        throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
      if (!userSnap.exists || !authoritySnap.exists)
        throw new functions.https.HttpsError("failed-precondition", "Running authority is unavailable.");
      const decision = applyRunningProposal({ current: authoritySnap.data(),
        proposal: proposalSnap.exists ? proposalSnap.data() : null,
        receipt: receiptSnap.exists ? receiptSnap.data() : null, request, nowMs });
      if (decision.outcome === "applied") {
        tx.set(authority, decision.next);
        tx.create(receipt, decision.receipt);
      }
      return { outcome: decision.outcome, receipt: decision.receipt };
    });
  } catch (error) {
    if (error instanceof RunningAuthorityError)
      throw new functions.https.HttpsError("failed-precondition", "Running review needs to be refreshed.", {
        errorCode: error.code,
      });
    throw error;
  }
}
module.exports = { acceptRunningProposalTransaction };

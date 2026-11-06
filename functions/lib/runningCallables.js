"use strict";
const functions = require("firebase-functions/v1");
const accountDeletionLocks = require("./accountDeletionLocks");
const { negotiateRunningAuthority, enrollRunningAuthority } = require("./runningEnrollment");
const { completeRunningMigrationTransaction } = require("./runningMigrationTransaction");
const { adoptInitialRunningPlanTransaction } = require("./runningInitialPlanTransaction");
const { saveRunningReviewTransaction } = require("./runningReviewTransaction");
const { createRunningProposalTransaction } = require("./runningProposalTransaction");
const { acceptRunningProposalTransaction } = require("./runningAuthorityTransaction");
const { authorizeRunningLaunchTransaction, registerRunningStartTransaction } = require("./runningLaunchTransaction");
const { reconcileRunningActivityTransaction } = require("./runningActivityReconciliation");
const { submitOutsideTrainingReportTransaction } = require("./runningTrainingReportTransaction");
// Source-time release switch. Neither a client field nor a rollout document can
// enable this build. Enabling requires the remaining adoption/render gates.
const RUNNING_AUTHORITY_TRANSPORT_ENABLED = false;
const ACTIONS = {
  negotiateRunningAuthority, enrollRunningAuthority,
  authorizeRunningLaunch: authorizeRunningLaunchTransaction,
  registerRunningStart: registerRunningStartTransaction,
  reconcileRunningActivity: reconcileRunningActivityTransaction,
  completeRunningMigration: completeRunningMigrationTransaction,
  adoptInitialRunningPlan: adoptInitialRunningPlanTransaction,
  saveRunningReview: saveRunningReviewTransaction,
  createRunningProposal: createRunningProposalTransaction,
  acceptRunningProposal: acceptRunningProposalTransaction,
  submitOutsideTrainingReport: submitOutsideTrainingReportTransaction,
};
function assertTransportCapability(snapshot) {
  if (!snapshot.exists || snapshot.data().protocolVersion !== 1 || snapshot.data().transportEnabled !== true || snapshot.data().enrollmentEnabled !== true)
    throw new functions.https.HttpsError("unavailable", "Running review is not available yet.");
}
// Every domain operation uses this transaction facade. The capability document
// participates in the same Firestore read set as authority/receipts, so a
// concurrent disable forces a retry that refuses the write. Do not mutate the
// shared SDK instance or replace the transaction's own conflict handling.
function capabilityBoundFirestore(firestore) {
  return {
    doc: (...args) => firestore.doc(...args),
    collection: (...args) => firestore.collection(...args),
    runTransaction: (update, options) => firestore.runTransaction(async tx => {
      assertTransportCapability(await tx.get(firestore.doc("system/runningAuthority")));
      return update(tx);
    }, options),
  };
}
function makeRunningHandler(action, dependencies, enabled = RUNNING_AUTHORITY_TRANSPORT_ENABLED) {
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) throw Error("Unknown running action");
  return async (data, context) => {
    if (!context?.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(context.auth.uid)) throw new functions.https.HttpsError("invalid-argument", "Invalid account identity.");
    if (!context.app?.appId) throw new functions.https.HttpsError("failed-precondition", "App verification required.");
    if (!data || data.expectedUid !== context.auth.uid) throw new functions.https.HttpsError("cancelled", "The signed-in account changed.");
    if (!enabled) throw new functions.https.HttpsError("unavailable", "Running review is not available yet.");
    const firestore = dependencies.firestore();
    const rollout = await firestore.doc("system/runningAuthority").get();
    assertTransportCapability(rollout);
    await accountDeletionLocks.assertCallableActorNotDeleting(firestore, context.auth.uid);
    if (await dependencies.isRateLimited(context.auth.uid, action))
      throw new functions.https.HttpsError("resource-exhausted", "Too many requests. Try again shortly.");
    // Transaction implementations recheck account deletion, authority and
    // revisions. Do not log requests/errors containing private health answers.
    return ACTIONS[action]({ firestore: capabilityBoundFirestore(firestore), context, data });
  };
}
module.exports = { makeRunningHandler };

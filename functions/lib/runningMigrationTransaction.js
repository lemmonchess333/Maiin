/** Explicit snapshot-bound legacy retirement. Unknown safety facts stay held;
 * no generic hold clearing, inferred capacity, or legacy plan import. */
"use strict";
const functions = require("firebase-functions/v1");
const { createHash } = require("node:crypto");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");
const { reconcileLegacyRunning } = require("./runningLegacyReconciliation");
const { validateCanonicalReview } = require("./runningReviewTransaction");
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const rev = value => Number.isSafeInteger(value) && value >= 0;
function blocked(errorCode) { throw new functions.https.HttpsError("failed-precondition", "Running migration needs review.", { errorCode }); }
async function completeRunningMigrationTransaction({ firestore, context, data, clock = Date.now }) {
  const uid = context?.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  if (data?.expectedUid !== uid) throw new functions.https.HttpsError("cancelled", "The signed-in account changed.");
  if (!id(uid) || !record(data) || Object.keys(data).some(key => !["expectedUid", "expectedRevision", "requestId", "raceGoalId", "confirmed", "acknowledgedLegacyPrescriptionsRetired", "expectedLegacyDigest", "confirmedLegacyReview"].includes(key)) ||
      !rev(data.expectedRevision) || !id(data.requestId) || !(data.raceGoalId === null || id(data.raceGoalId)) || data.confirmed !== true || data.acknowledgedLegacyPrescriptionsRetired !== true ||
      (data.expectedLegacyDigest !== undefined && (typeof data.expectedLegacyDigest !== "string" || !/^[a-f0-9]{64}$/.test(data.expectedLegacyDigest))) ||
      (data.confirmedLegacyReview !== undefined && data.confirmedLegacyReview !== true))
    throw new functions.https.HttpsError("invalid-argument", "Invalid migration confirmation.");
  const request = { accountId: uid, expectedRevision: data.expectedRevision, requestId: data.requestId, raceGoalId: data.raceGoalId,
    ...(data.expectedLegacyDigest !== undefined ? { expectedLegacyDigest: data.expectedLegacyDigest, confirmedLegacyReview: data.confirmedLegacyReview === true } : {}) };
  const fingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const paths = [`users/${uid}`, `users/${uid}/runningState/current`, `users/${uid}/runningState/legacySnapshot`,
    `users/${uid}/runningState/migrationReceipt`, `${ledger.COLLECTION}/${uid}`, `${tombstones.COLLECTION}/${uid}`, `users/${uid}/programState/current`, "system/runningAuthority"].map(path => firestore.doc(path));
  return firestore.runTransaction(async tx => {
    const [profile, authority, snapshot, receipt, deletion, tombstone, liveLegacy, rollout] = await Promise.all(paths.map(ref => tx.get(ref)));
    const now = clock(); if (!rev(now)) blocked("invalid-clock");
    if (deletion.exists && status.isStatusActive(deletion.data().status)) throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
    if (tombstone.exists && status.isTombstoneLive(tombstone.data(), now)) throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
    if (!rollout.exists || rollout.data().protocolVersion !== 1 || rollout.data().enrollmentEnabled !== true || rollout.data().migrationEnabled !== true) blocked("rollout-disabled");
    if (!profile.exists || !authority.exists || !snapshot.exists) blocked("authority-unavailable");
    const current = authority.data();
    if (!record(current) || current.schemaVersion !== 1 || current.accountId !== uid || !rev(current.revision) ||
        !Array.isArray(current.holds) || !current.holds.every(id) || !record(current.plan) || !Array.isArray(current.plan.sessions) ||
        !record(current.migration) || current.migration.version !== 1) blocked("invalid-authority");

    if (receipt.exists) {
      const prior = receipt.data();
      if (!record(prior) || prior.schemaVersion !== 1 || prior.accountId !== uid || prior.requestId !== request.requestId || prior.fingerprint !== fingerprint ||
          prior.raceGoalId !== request.raceGoalId || prior.baseRevision !== request.expectedRevision || !rev(prior.appliedRevision) ||
          prior.appliedRevision !== prior.baseRevision + 1 || prior.appliedRevision > current.revision || current.migration.status !== "complete") blocked("migration-request-conflict");
      return { outcome: "replayed", receipt: prior, status: current.holds.length ? "held" : "ready" };
    }
    if (current.revision !== request.expectedRevision || current.plan.raceGoalId !== request.raceGoalId) blocked("revision-conflict");
    if (current.revision === Number.MAX_SAFE_INTEGER) blocked("revision-exhausted");
    if (current.migration.status !== "review_required" || current.migration.initialReviewPending !== false ||
        !rev(current.migration.initialReviewCompletedAtRevision) || current.migration.initialReviewCompletedAtRevision < 1 ||
        current.migration.initialReviewCompletedAtRevision > current.revision || current.migration.legacySnapshotId !== "legacySnapshot") blocked("migration-review-required");
    // Do not interpret, drop, or promote any unreviewed legacy safety facts.
    if (!record(snapshot.data()) || current.plan.sessions.length) blocked("legacy-reconciliation-required");
    let reconciliation;
    if (current.migration.legacyStateExisted === true) {
      reconciliation = reconcileLegacyRunning(snapshot.data());
      if (request.confirmedLegacyReview !== true || request.expectedLegacyDigest !== reconciliation.snapshotDigest ||
          !liveLegacy.exists || reconcileLegacyRunning(liveLegacy.data()).snapshotDigest !== reconciliation.snapshotDigest) blocked("legacy-reconciliation-required");
    } else if (current.migration.legacyStateExisted !== false || liveLegacy.exists || Object.keys(snapshot.data()).length) blocked("legacy-reconciliation-required");
    const confirmation = current.constraints?.reviewConfirmation;
    if (!record(confirmation) || Object.keys(confirmation).some(key => !["version", "confirmed", "authorityRevision", "raceGoalId"].includes(key)) || confirmation.version !== 1 || confirmation.confirmed !== true ||
        confirmation.authorityRevision !== current.revision || confirmation.raceGoalId !== current.plan.raceGoalId || !validateCanonicalReview(current, uid)) blocked("current-review-required");
    if (!current.holds.includes("enrollment_review_required")) blocked("invalid-migration-hold");
    const nextRevision = current.revision + 1;
    const holds = [...new Set([...current.holds.filter(hold => hold !== "enrollment_review_required"), ...(reconciliation?.holds || [])])];
    const savedReceipt = { schemaVersion: 1, accountId: uid, requestId: request.requestId, raceGoalId: request.raceGoalId,
      fingerprint, baseRevision: current.revision, appliedRevision: nextRevision };
    // Revision advances and deliberately stales the review marker: obtain a fresh
    // review before any later prescription command. History and all other holds remain.
    tx.set(paths[1], { ...current, revision: nextRevision, holds, migration: { ...current.migration, status: "complete", completedAtMs: now, ...(reconciliation ? { reconciliation } : {}) } });
    tx.create(paths[3], savedReceipt);
    return { outcome: "completed", receipt: savedReceipt, status: holds.length ? "held" : "ready" };
  });
}
module.exports = { completeRunningMigrationTransaction };

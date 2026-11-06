/**
 * Reporting remains dormant until authenticated client negotiation,
 * adoption/evidence adapters, rate limits/App Check, correction handling and
 * emulator validation are complete. Callable transport is installed but defaults off.
 */
"use strict";
const functions = require("firebase-functions/v1");
const { isDeepStrictEqual } = require("node:util");
const { createHash } = require("node:crypto");
const { isCalendarDate } = require("./dateUtils");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");

// Pinned against the client catalogue by runningReportTemplates.cross.test.ts.
const REPORT_STAGE_SESSIONS = Object.freeze([
  ["run_walk_1", 29], ["run_walk_2", 29], ["run_walk_3", 25],
  ["run_walk_4", 30], ["run_walk_5", 30], ["run_walk_6", 30],
  ["run_nonstop_20", 30], ["run_nonstop_25", 35], ["run_nonstop_30", 40],
].map(([templateId, minutes]) => Object.freeze({ templateId, minutes })));
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0;
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fail(code, message) { throw new functions.https.HttpsError(code, message); }
function keys(value, allowed) { return record(value) && Object.keys(value).every(key => allowed.includes(key)); }
function sameReport(a, b) {
  return record(a) && record(b) && Object.keys(a).length === Object.keys(b).length &&
    Object.keys(b).every(key => owns(a, key) && a[key] === b[key]);
}
function requestOf(data, context) {
  const uid = context?.auth?.uid;
  if (!uid) fail("unauthenticated", "Auth required.");
  if (!data || data.expectedUid !== uid) fail("cancelled", "The signed-in account changed.");
  if (!identifier(uid) || !keys(data, ["expectedUid", "commandId", "expectedAuthorityRevision", "raceGoalId", "scheduledRunId", "confirmationVersion", "report"]) ||
      !identifier(data.commandId) || !revision(data.expectedAuthorityRevision) ||
      !(data.raceGoalId === null || identifier(data.raceGoalId)) || !identifier(data.scheduledRunId) ||
      data.confirmationVersion !== "outside-training-report-v1") fail("invalid-argument", "Invalid training report request.");
  const r = data.report;
  if (!keys(r, ["activityId", "date", "source", "durationSeconds", "relativeEffort", "sessionCompletedAsDescribed", "completedStage", "manageable"]) ||
      typeof r.activityId !== "string" || !/^outside:[A-Za-z0-9_-]{1,128}$/.test(r.activityId) ||
      r.source !== "outside_session" || !isCalendarDate(r.date) ||
      !Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0 || r.durationSeconds > 86400 ||
      !["easier", "matched", "harder", null].includes(r.relativeEffort) ||
      (owns(r, "sessionCompletedAsDescribed") && typeof r.sessionCompletedAsDescribed !== "boolean") ||
      (owns(r, "manageable") && typeof r.manageable !== "boolean") ||
      (owns(r, "completedStage") && (!Number.isInteger(r.completedStage) || r.completedStage < 1 || r.completedStage > REPORT_STAGE_SESSIONS.length)) ||
      (r.sessionCompletedAsDescribed === true ? !owns(r, "completedStage") : owns(r, "completedStage"))) fail("invalid-argument", "Invalid training report facts.");
  if (r.sessionCompletedAsDescribed === true && r.durationSeconds < REPORT_STAGE_SESSIONS[r.completedStage - 1].minutes * 60)
    fail("invalid-argument", "Duration does not describe the full claimed session.");
  // Copy accepted primitives in a fixed order before any await. No request
  // mutation can alter a transaction retry or its payload fingerprint.
  return { expectedUid: uid, commandId: data.commandId, expectedAuthorityRevision: data.expectedAuthorityRevision,
    raceGoalId: data.raceGoalId, scheduledRunId: data.scheduledRunId, confirmationVersion: data.confirmationVersion,
    report: { activityId: r.activityId, date: r.date, source: r.source,
      durationSeconds: r.durationSeconds, relativeEffort: r.relativeEffort,
      ...(owns(r, "sessionCompletedAsDescribed") ? { sessionCompletedAsDescribed: r.sessionCompletedAsDescribed } : {}),
      ...(owns(r, "completedStage") ? { completedStage: r.completedStage } : {}),
      ...(owns(r, "manageable") ? { manageable: r.manageable } : {}) } };
}
function todayInZone(nowMs, timeZone) {
  try {
    if (typeof timeZone !== "string" || !timeZone) throw Error();
    const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
  } catch { fail("failed-precondition", "Running time zone needs review."); }
}
async function submitOutsideTrainingReportTransaction({ firestore, context, data, clock = Date.now }) {
  const request = requestOf(data, context);
  const uid = request.expectedUid;
  const payloadHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const user = firestore.doc(`users/${uid}`);
  const authority = firestore.doc(`users/${uid}/runningState/current`);
  const report = firestore.doc(`users/${uid}/runningTrainingReports/${request.report.activityId}`);
  const receipt = firestore.doc(`users/${uid}/runningReportReceipts/${request.commandId}`);
  const adoption = firestore.doc(`users/${uid}/runningState/initialPlanReceipt`);
  const savedCollision = firestore.doc(`users/${uid}/runs/${request.report.activityId}`);
  const deletion = firestore.doc(`${ledger.COLLECTION}/${uid}`);
  const tombstone = firestore.doc(`${tombstones.COLLECTION}/${uid}`);
  return firestore.runTransaction(async tx => {
    const [userSnap, authoritySnap, reportSnap, receiptSnap, savedSnap, deletionSnap, tombstoneSnap, adoptionSnap] =
      await Promise.all([user, authority, report, receipt, savedCollision, deletion, tombstone, adoption].map(ref => tx.get(ref)));
    const nowMs = clock();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail("internal", "Invalid server clock.");
    if (deletionSnap.exists && status.isStatusActive(deletionSnap.data().status)) throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
    if (tombstoneSnap.exists && status.isTombstoneLive(tombstoneSnap.data(), nowMs)) throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
    if (!userSnap.exists || !authoritySnap.exists) fail("failed-precondition", "Running authority is unavailable.");
    const current = authoritySnap.data();
    if (current.schemaVersion !== 1 || current.accountId !== uid || !revision(current.revision) ||
        !record(current.plan) || !Array.isArray(current.plan.sessions) || !record(current.constraints) ||
        !Array.isArray(current.holds) || !current.holds.every(identifier)) fail("failed-precondition", "Invalid running authority.");
    // Deletion/account checks precede replay. A later plan/hold change need not
    // erase proof of a previously saved fact; replay never changes authority.
    if (receiptSnap.exists) {
      const prior = receiptSnap.data();
      const stored = reportSnap.exists ? reportSnap.data() : null;
      if (!record(prior) || prior.schemaVersion !== 1 || prior.payloadHash !== payloadHash ||
          prior.accountId !== uid || prior.commandId !== request.commandId || prior.raceGoalId !== request.raceGoalId ||
          prior.scheduledRunId !== request.scheduledRunId || prior.baseRevision !== request.expectedAuthorityRevision ||
          prior.activityId !== request.report.activityId || prior.authorityRevision !== prior.baseRevision + 1 ||
          prior.authorityRevision > current.revision || !stored || stored.schemaVersion !== 1 || stored.accountId !== uid || stored.commandId !== request.commandId ||
          stored.raceGoalId !== request.raceGoalId || stored.scheduledRunId !== request.scheduledRunId ||
          stored.activityId !== request.report.activityId || stored.authorityRevision !== prior.authorityRevision ||
          stored.payloadHash !== payloadHash || stored.reportRevision !== 1 ||
          stored.baseRevision !== prior.baseRevision || stored.confirmationVersion !== request.confirmationVersion ||
          !Number.isSafeInteger(prior.recordedAtMs) || prior.recordedAtMs < 0 || prior.recordedAtMs > nowMs ||
          stored.recordedAtMs !== prior.recordedAtMs || !sameReport(prior.report, request.report) || !sameReport(stored.report, request.report))
        fail("failed-precondition", "Training report command conflicts with an earlier save.");
      return { outcome: "replayed", receipt: prior };
    }
    if (current.revision !== request.expectedAuthorityRevision || current.revision >= Number.MAX_SAFE_INTEGER || current.plan.raceGoalId !== request.raceGoalId)
      fail("failed-precondition", "The running plan changed; review it before reporting.");
    const sessions = current.plan.sessions.filter(row => row?.id === request.scheduledRunId);
    const session = sessions[0];
    if (sessions.length !== 1 || !record(session) || !isCalendarDate(session.date) ||
        !["easy", "run_walk", "long", "quality"].includes(session.kind) || !identifier(session.templateId) ||
        !REPORT_STAGE_SESSIONS.some(template => template.templateId === session.templateId)) fail("failed-precondition", "A report needs a current non-race session.");
    // A null-goal template is not proof of adoption. Bind its explicit stage
    // to the durable initial confirmation and unchanged canonical sessions.
    // Revision may advance for other reports without invalidating this scope.
    if (request.raceGoalId === null || current.acceptedRunWalkStage !== undefined) {
      const scope = current.acceptedRunWalkStage;
      const adopted = adoptionSnap.exists ? adoptionSnap.data() : null;
      if (!keys(scope, ["version", "stage", "adoptionRequestId", "adoptedAtRevision", "raceGoalId", "sessionIds"]) ||
          scope.version !== 1 || scope.stage !== 1 || !identifier(scope.adoptionRequestId) ||
          !revision(scope.adoptedAtRevision) || scope.adoptedAtRevision < 1 || scope.adoptedAtRevision > current.revision ||
          scope.raceGoalId !== null || request.raceGoalId !== scope.raceGoalId ||
          !Array.isArray(scope.sessionIds) || scope.sessionIds.length < 1 || scope.sessionIds.length > 3 ||
          !scope.sessionIds.every(identifier) || new Set(scope.sessionIds).size !== scope.sessionIds.length ||
          !scope.sessionIds.includes(request.scheduledRunId) ||
          !record(adopted) || adopted.schemaVersion !== 1 || adopted.accountId !== uid ||
          adopted.requestId !== scope.adoptionRequestId || adopted.raceGoalId !== scope.raceGoalId ||
          !revision(adopted.baseRevision) || adopted.appliedRevision !== adopted.baseRevision + 1 ||
          adopted.appliedRevision !== scope.adoptedAtRevision ||
          !isDeepStrictEqual(adopted.acceptedRunWalkStage, scope) ||
          !Array.isArray(adopted.sessions) || !isDeepStrictEqual(adopted.sessions.map(row => row?.id), scope.sessionIds) ||
          !adopted.sessions.every(row => record(row) && isCalendarDate(row.date) &&
            row.templateId === "run_walk_1" && row.minutes === 29 && row.kind === "run_walk" &&
            current.plan.sessions.filter(live => live?.id === row.id).length === 1 &&
            isDeepStrictEqual(current.plan.sessions.find(live => live?.id === row.id), row)) ||
          (request.report.sessionCompletedAsDescribed === true && request.report.completedStage !== scope.stage))
        fail("failed-precondition", "The accepted running stage changed; review it before reporting.");
    }
    if (request.report.sessionCompletedAsDescribed === true && session.templateId !== REPORT_STAGE_SESSIONS[request.report.completedStage - 1].templateId)
      fail("failed-precondition", "The reported stage does not match this session.");
    if (request.report.date > todayInZone(nowMs, current.timeZone)) fail("invalid-argument", "Training cannot be reported in the future.");
    if (reportSnap.exists || savedSnap.exists) fail("already-exists", "This activity identity is already in use; review the existing report.");
    const nextRevision = current.revision + 1;
    const accepted = { schemaVersion: 1, accountId: uid, commandId: request.commandId,
      raceGoalId: request.raceGoalId, scheduledRunId: request.scheduledRunId,
      activityId: request.report.activityId, report: request.report,
      baseRevision: current.revision, authorityRevision: nextRevision, payloadHash, recordedAtMs: nowMs };
    tx.create(report, { ...accepted, reportRevision: 1, confirmationVersion: request.confirmationVersion });
    tx.create(receipt, accepted);
    // Evidence invalidates pending previews. It never changes the prescriptions,
    // completions, accepted capacity, race goal, history, or any independent hold.
    tx.update(authority, { revision: nextRevision });
    return { outcome: "saved", receipt: accepted };
  });
}
module.exports = { submitOutsideTrainingReportTransaction, REPORT_STAGE_SESSIONS };

/**
 * Preview creation remains dormant until canonical review persistence,
 * all input revisions, enrollment, emulator validation and client read gating
 * are complete. Callable transport is installed but defaults off.
 */
"use strict";

const { createHash } = require("node:crypto");
const functions = require("firebase-functions/v1");
const { isCalendarDate } = require("./dateUtils");
const { applyRunningProposal, RunningAuthorityError } = require("./runningAuthority");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");
const PREVIEW_LIFETIME_MS = 5 * 60 * 1000;
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const keysOnly = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
function invalid() { throw new functions.https.HttpsError("invalid-argument", "Invalid running preview request."); }
function precondition(errorCode) {
  return new functions.https.HttpsError("failed-precondition", "Running review needs to be refreshed.", { errorCode });
}
function parseRequest(data, context) {
  if (!context?.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  const uid = context.auth.uid;
  if (!data || data.expectedUid !== uid)
    throw new functions.https.HttpsError("cancelled", "Running review belongs to another account.");
  if (!identifier(uid) || !keysOnly(data, ["expectedUid", "expectedRevision", "requestId", "windowStart", "selections"]) ||
      !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0 ||
      !identifier(data.requestId) || !isCalendarDate(data.windowStart) ||
      !Array.isArray(data.selections) || data.selections.length < 1 || data.selections.length > 7) invalid();
  const ids = new Set();
  const selections = data.selections.map(selection => {
    if (!keysOnly(selection, ["sessionId", "maxMinutes", "format"]) ||
        !identifier(selection.sessionId) || ids.has(selection.sessionId) ||
        !Number.isFinite(selection.maxMinutes) || selection.maxMinutes <= 0 || selection.maxMinutes > 1440 ||
        !record(selection.format)) invalid();
    ids.add(selection.sessionId);
    const f = selection.format;
    if (f.kind === "easy" && keysOnly(f, ["kind"]))
      return { sessionId: selection.sessionId, maxMinutes: selection.maxMinutes, format: { kind: "easy" } };
    if (f.kind === "run_walk" && keysOnly(f, ["kind", "templateId"]) && identifier(f.templateId))
      return { sessionId: selection.sessionId, maxMinutes: selection.maxMinutes,
        format: { kind: "run_walk", templateId: f.templateId } };
    invalid();
  });
  return { uid, expectedRevision: data.expectedRevision, requestId: data.requestId,
    windowStart: data.windowStart, selections };
}
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// The default executes generated code from the REAL shared catalogue/planner.
// Missing code or invalid canonical review fails closed; there is no fallback.
const sharedDomainPlanner = input => require("./generated/runningAdaptationDomain.cjs").serverDomainPlan(input);
function previewMatchesPlan(preview, plan) {
  if (!Array.isArray(preview?.after) || !Array.isArray(plan?.sessions) ||
      preview.after.length !== plan.sessions.length ||
      new Set(preview.after.map(row => row?.id)).size !== preview.after.length) return false;
  return plan.sessions.every(session => preview.after.some(row => row &&
    row.id === session.id && row.date === session.date &&
    row.minutes === session.minutes && row.kind === session.kind));
}
function safeNow(clock) {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - PREVIEW_LIFETIME_MS)
    throw new functions.https.HttpsError("internal", "Invalid server clock.");
  return now;
}

async function createRunningProposalTransaction({ firestore, context, data, clock = Date.now,
  domainPlanner = sharedDomainPlanner }) {
  const request = parseRequest(data, context);
  const { uid } = request;
  const proposalId = digest(["running-preview-v1", uid, request.requestId]);
  const requestFingerprint = digest([request.expectedRevision, request.windowStart, request.selections]);
  const userRef = firestore.doc(`users/${uid}`);
  const authorityRef = firestore.collection("users").doc(uid).collection("runningState").doc("current");
  const proposalRef = firestore.collection("users").doc(uid).collection("runningProposals").doc(proposalId);
  const deletionRef = firestore.collection(ledger.COLLECTION).doc(uid);
  const tombstoneRef = firestore.collection(tombstones.COLLECTION).doc(uid);
  try {
    return await firestore.runTransaction(async tx => {
      const [user, authoritySnap, existing, deletion, tombstone] = await Promise.all(
        [userRef, authorityRef, proposalRef, deletionRef, tombstoneRef].map(ref => tx.get(ref)));
      const nowMs = safeNow(clock);
      if (deletion.exists && status.isStatusActive(deletion.data().status))
        throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
      if (tombstone.exists && status.isTombstoneLive(tombstone.data(), nowMs))
        throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
      if (!user.exists || !authoritySnap.exists) throw precondition("authority-unavailable");
      const authority = authoritySnap.data();
      if (authority.accountId !== uid || authority.revision !== request.expectedRevision)
        throw precondition("revision-conflict");
      let proposal;
      if (existing.exists) {
        proposal = existing.data();
        if (proposal.requestFingerprint !== requestFingerprint || proposal.id !== proposalId ||
            proposal.accountId !== uid || proposal.baseRevision !== request.expectedRevision ||
            proposal.windowStart !== request.windowStart) throw precondition("preview-request-conflict");
      } else {
        // Only trusted canonical context reaches the pure server domain. No
        // client authority/constraints/preview/validation marker is accepted.
        const result = domainPlanner({ authority, windowStart: request.windowStart,
          selections: request.selections, nowMs });
        if (!record(result) || !record(result.preview) || result.preview.status !== "preview" ||
            result.preview.accountId !== uid || result.preview.revision !== authority.revision ||
            result.preview.raceGoalId !== authority.plan?.raceGoalId || !record(result.plan) ||
            !previewMatchesPlan(result.preview, result.plan))
          throw precondition("domain-preview-unavailable");
        proposal = { id: proposalId, accountId: uid, baseRevision: authority.revision,
          windowStart: request.windowStart, expiresAtMs: nowMs + PREVIEW_LIFETIME_MS,
          validation: { policyVersion: 1, authorityRevision: authority.revision },
          plan: result.plan, preview: result.preview, requestFingerprint };
      }
      if (!record(proposal.preview) || proposal.preview.status !== "preview" ||
          proposal.preview.accountId !== uid || proposal.preview.revision !== authority.revision ||
          proposal.preview.raceGoalId !== authority.plan?.raceGoalId ||
          !previewMatchesPlan(proposal.preview, proposal.plan))
        throw precondition("domain-preview-unavailable");
      // Validate patch preservation/holds/time with the SAME pure boundary used
      // by acceptance, but discard the next-state decision. Preview never writes
      // authority, clears holds, adopts capacity or completes an activity.
      applyRunningProposal({ current: authority, proposal, nowMs: safeNow(clock), request: {
        uid, proposalId, expectedRevision: request.expectedRevision,
        idempotencyKey: proposalId, accepted: true,
      } });
      if (!existing.exists) tx.create(proposalRef, proposal);
      return { proposal, replayed: existing.exists };
    });
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof RunningAuthorityError) throw precondition(error.code);
    // Never expose an internal module path or domain exception details to a
    // future caller. Domain absence/error is an unavailable preview, not a plan.
    throw precondition("domain-preview-unavailable");
  }
}
module.exports = { createRunningProposalTransaction };

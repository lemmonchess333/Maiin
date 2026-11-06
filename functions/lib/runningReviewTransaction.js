/**
 * Canonical review saving remains dormant until enrollment, explicit
 * hold resolution, client compatibility, App Check/rate limits and emulator
 * validation are complete. No callable exports this transaction.
 */
"use strict";
const functions = require("firebase-functions/v1");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0;
const goal = value => value === null || identifier(value);
const minutes = value => Number.isFinite(value) && value > 0 && value <= 1440;
const days = value => Number.isInteger(value) && value >= 1 && value <= 7;
function invalid() { throw new functions.https.HttpsError("invalid-argument", "Invalid running review."); }
function blocked(code) { throw new functions.https.HttpsError("failed-precondition", "Running review needs to be refreshed.", { errorCode: code }); }
const CONSTRAINT_KEYS = ["symptoms", "capacity", "restrictions", "reviewConfirmation", "confirmedEasyPaceSecondsPerKm"];
function parse(data, context) {
  const uid = context?.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  if (!data || data.expectedUid !== uid) throw new functions.https.HttpsError("cancelled", "The signed-in account changed.");
  if (!identifier(uid) || !keys(data, ["expectedUid", "expectedRevision", "requestId", "raceGoalId", "confirmed", "review"]) ||
      !revision(data.expectedRevision) || !identifier(data.requestId) || !goal(data.raceGoalId) || data.confirmed !== true) invalid();
  const v = data.review;
  if (!keys(v, ["symptoms", "capacity", "restrictions", "confirmedEasyPaceSecondsPerKm"]) ||
      !["none", "during_or_after", "daily_activities", "concerning", "unknown"].includes(v.symptoms)) invalid();
  const c = v.capacity;
  if (!keys(c, ["confirmed", "afterEffectsReviewed", "daysPerWeek", "longestMinutes"]) ||
      typeof c.confirmed !== "boolean" || typeof c.afterEffectsReviewed !== "boolean" ||
      (c.confirmed ? !days(c.daysPerWeek) || !minutes(c.longestMinutes) : c.daysPerWeek !== null || c.longestMinutes !== null)) invalid();
  const r = v.restrictions;
  let restrictions;
  if (keys(r, ["status"]) && ["none", "unknown"].includes(r.status)) restrictions = { status: r.status };
  else if (keys(r, ["status", "source", "noRunning", "maxMinutes", "maxDays", "easyOnly", "runWalkOnly", "unsupported"]) &&
      r.status === "specified" && r.source === "clinician" && typeof r.noRunning === "boolean" &&
      (!owns(r, "maxMinutes") || minutes(r.maxMinutes)) && (!owns(r, "maxDays") || days(r.maxDays)) &&
      ["easyOnly", "runWalkOnly", "unsupported"].every(key => !owns(r, key) || typeof r[key] === "boolean")) {
    restrictions = { status: "specified", source: "clinician", noRunning: r.noRunning };
    for (const key of ["maxMinutes", "maxDays", "easyOnly", "runWalkOnly", "unsupported"]) if (owns(r, key)) restrictions[key] = r[key];
  } else invalid();
  if (owns(v, "confirmedEasyPaceSecondsPerKm") && (!Number.isFinite(v.confirmedEasyPaceSecondsPerKm) || v.confirmedEasyPaceSecondsPerKm <= 0 || v.confirmedEasyPaceSecondsPerKm > 3600)) invalid();
  // Fixed-order primitive copy before any await; never store free text/location,
  // raw request data, clinician names, arbitrary medical notes or logs.
  return { uid, expectedRevision: data.expectedRevision, requestId: data.requestId, raceGoalId: data.raceGoalId,
    review: { symptoms: v.symptoms, capacity: { confirmed: c.confirmed, afterEffectsReviewed: c.afterEffectsReviewed, daysPerWeek: c.daysPerWeek, longestMinutes: c.longestMinutes }, restrictions,
      ...(owns(v, "confirmedEasyPaceSecondsPerKm") ? { confirmedEasyPaceSecondsPerKm: v.confirmedEasyPaceSecondsPerKm } : {}) } };
}
function needsHold(review) {
  const r = review?.restrictions;
  return !review || ["daily_activities", "concerning", "unknown"].includes(review.symptoms) ||
    review.capacity?.confirmed !== true || review.capacity?.afterEffectsReviewed !== true || !r || r.status === "unknown" ||
    (r.status === "specified" && (r.noRunning || r.unsupported)) ||
    (review.symptoms === "during_or_after" && (r.status !== "specified" || !(r.maxMinutes || r.maxDays || r.easyOnly || r.runWalkOnly)));
}
function initialEnrollmentReview(current) {
  return current.revision === 0 && current.migration?.version === 1 &&
    current.migration.status === "review_required" && current.migration.initialReviewPending === true &&
    current.holds.includes("enrollment_review_required") && current.plan.sessions.length === 0 &&
    isDeepStrictEqual(current.constraints, { symptoms: "unknown", capacity: {
      confirmed: false, afterEffectsReviewed: false, daysPerWeek: null, longestMinutes: null }, restrictions: { status: "unknown" } });
}
function validateCanonicalReview(current, uid) {
  if (!keys(current.constraints, CONSTRAINT_KEYS)) blocked("invalid-authority");
  const review = { ...current.constraints }; delete review.reviewConfirmation;
  try { parse({ expectedUid: uid, expectedRevision: current.revision, requestId: "canonical_validation",
    raceGoalId: current.plan.raceGoalId, confirmed: true, review }, { auth: { uid } }); }
  catch { blocked("invalid-authority"); }
  return !needsHold(review);
}
async function saveRunningReviewTransaction({ firestore, context, data, clock = Date.now }) {
  const request = parse(data, context);
  const uid = request.uid;
  const fingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const user = firestore.doc(`users/${uid}`);
  const authority = firestore.doc(`users/${uid}/runningState/current`);
  const receipt = firestore.doc(`users/${uid}/runningReviewReceipts/${request.requestId}`);
  const deletion = firestore.doc(`${ledger.COLLECTION}/${uid}`);
  const tombstone = firestore.doc(`${tombstones.COLLECTION}/${uid}`);
  return firestore.runTransaction(async tx => {
    const [userSnap, authoritySnap, receiptSnap, deletionSnap, tombstoneSnap] = await Promise.all([user, authority, receipt, deletion, tombstone].map(ref => tx.get(ref)));
    const nowMs = clock();
    if (!revision(nowMs)) throw new functions.https.HttpsError("internal", "Invalid server clock.");
    if (deletionSnap.exists && status.isStatusActive(deletionSnap.data().status)) throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
    if (tombstoneSnap.exists && status.isTombstoneLive(tombstoneSnap.data(), nowMs)) throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
    if (!userSnap.exists || !authoritySnap.exists) blocked("authority-unavailable");
    const current = authoritySnap.data();
    if (!record(current) || current.schemaVersion !== 1 || current.accountId !== uid || !revision(current.revision) ||
        !record(current.plan) || !goal(current.plan.raceGoalId) || !Array.isArray(current.plan.sessions) ||
        !Array.isArray(current.holds) || !current.holds.every(identifier) || !keys(current.constraints, CONSTRAINT_KEYS)) blocked("invalid-authority");
    try { if (typeof current.timeZone !== "string" || !current.timeZone) throw Error(); new Intl.DateTimeFormat("en", { timeZone: current.timeZone }).format(new Date(nowMs)); }
    catch { blocked("invalid-authority"); }
    // Do not erase unrecognized legacy safety limits while replacing a review.
    // Existing known review facts may be superseded explicitly; unknown shapes
    // require migration/status review instead of being silently dropped.
    if (Object.keys(current.constraints).length > 0) {
      const existingReview = { ...current.constraints };
      delete existingReview.reviewConfirmation;
      try { parse({ expectedUid: uid, expectedRevision: current.revision, requestId: "canonical_validation",
        raceGoalId: current.plan.raceGoalId, confirmed: true, review: existingReview }, context); }
      catch { blocked("invalid-authority"); }
    }
    if (receiptSnap.exists) {
      const prior = receiptSnap.data();
      if (!record(prior) || prior.schemaVersion !== 1 || prior.accountId !== uid || prior.requestId !== request.requestId ||
          prior.raceGoalId !== request.raceGoalId || prior.fingerprint !== fingerprint || prior.baseRevision !== request.expectedRevision ||
          !revision(prior.appliedRevision) || prior.appliedRevision !== prior.baseRevision + 1 || prior.appliedRevision > current.revision) blocked("review-request-conflict");
      return { outcome: "replayed", receipt: prior };
    }
    if (current.revision !== request.expectedRevision || current.plan.raceGoalId !== request.raceGoalId) blocked("revision-conflict");
    if (current.revision === Number.MAX_SAFE_INTEGER) blocked("revision-exhausted");
    const nextRevision = current.revision + 1;
    // New answers never clear independent holds, including a prior review hold.
    // Preserve a prior unsafe review even if the new answers claim no symptoms.
    const initialReview = initialEnrollmentReview(current);
    const priorUnsafe = !initialReview && Object.keys(current.constraints).length > 0 && needsHold(current.constraints);
    const holds = [...new Set([...current.holds, ...(priorUnsafe || needsHold(request.review) ? ["running_review_required"] : [])])];
    const constraints = { ...request.review, reviewConfirmation: { version: 1, confirmed: true, authorityRevision: nextRevision, raceGoalId: current.plan.raceGoalId } };
    const savedReceipt = { schemaVersion: 1, accountId: uid, requestId: request.requestId, raceGoalId: request.raceGoalId,
      fingerprint, baseRevision: current.revision, appliedRevision: nextRevision };
    tx.set(authority, { ...current, revision: nextRevision, constraints, holds, reviewUpdatedAtMs: nowMs,
      ...(initialReview ? { migration: { ...current.migration, initialReviewPending: false, initialReviewCompletedAtRevision: nextRevision } } : {}) });
    tx.create(receipt, savedReceipt);
    return { outcome: "saved", receipt: savedReceipt };
  });
}
module.exports = { saveRunningReviewTransaction, validateCanonicalReview };

/** Inactive initial run/walk adoption. No callable export. This deliberately
 * supports a non-race first week only, not race readiness or legacy import. */
"use strict";
const functions = require("firebase-functions/v1");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");
const { validateCanonicalReview } = require("./runningReviewTransaction");
const id = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const rev = v => Number.isSafeInteger(v) && v >= 0;
const record = v => v !== null && typeof v === "object" && !Array.isArray(v);
const date = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
function blocked(errorCode) { throw new functions.https.HttpsError("failed-precondition", "Initial running plan needs review.", { errorCode }); }
function localDate(now, timeZone) {
  try {
    if (typeof timeZone !== "string" || !timeZone) throw Error();
    const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    return ["year", "month", "day"].map(type => parts.find(p => p.type === type).value).join("-");
  } catch { blocked("invalid-timezone"); }
}
async function adoptInitialRunningPlanTransaction({ firestore, context, data, clock = Date.now }) {
  const uid = context?.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  if (data?.expectedUid !== uid) throw new functions.https.HttpsError("cancelled", "The signed-in account changed.");
  if (!id(uid) || !record(data) || Object.keys(data).some(k => !["expectedUid", "expectedRevision", "requestId", "raceGoalId", "confirmed", "confirmationVersion", "dates"].includes(k)) ||
      !rev(data.expectedRevision) || !id(data.requestId) || !(data.raceGoalId === null || id(data.raceGoalId)) || data.confirmed !== true || data.confirmationVersion !== "initial-run-walk-v1" ||
      !Array.isArray(data.dates) || data.dates.length < 1 || data.dates.length > 3 || !data.dates.every(date))
    throw new functions.https.HttpsError("invalid-argument", "Invalid initial plan confirmation.");
  const request = { accountId: uid, expectedRevision: data.expectedRevision, requestId: data.requestId, raceGoalId: data.raceGoalId, confirmationVersion: data.confirmationVersion, dates: [...data.dates].sort() };
  if (request.dates.some((d, i) => i > 0 && Date.parse(d) - Date.parse(request.dates[i - 1]) < 2 * 86400000)) blocked("nonconsecutive-days-required");
  const sessions = request.dates.map(d => ({ id: `initial_${d.replaceAll("-", "")}`, date: d, templateId: "run_walk_1", minutes: 29, kind: "run_walk" }));
  const acceptedRunWalkStage = { version: 1, stage: 1, adoptionRequestId: request.requestId, adoptedAtRevision: request.expectedRevision + 1, raceGoalId: null, sessionIds: sessions.map(session => session.id) };
  const fingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const refs = [`users/${uid}`, `users/${uid}/runningState/current`, `users/${uid}/runningState/initialPlanReceipt`, `${ledger.COLLECTION}/${uid}`, `${tombstones.COLLECTION}/${uid}`, "system/runningAuthority"].map(p => firestore.doc(p));
  return firestore.runTransaction(async tx => {
    const [profile, authority, receipt, deletion, tombstone, rollout] = await Promise.all(refs.map(ref => tx.get(ref)));
    const now = clock(); if (!rev(now)) blocked("invalid-clock");
    if (deletion.exists && status.isStatusActive(deletion.data().status)) throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
    if (tombstone.exists && status.isTombstoneLive(tombstone.data(), now)) throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
    if (!rollout.exists || rollout.data().protocolVersion !== 1 || rollout.data().initialPlanEnabled !== true) blocked("rollout-disabled");
    if (!profile.exists || !authority.exists) blocked("authority-unavailable");
    const current = authority.data();
    if (!record(current) || current.schemaVersion !== 1 || current.accountId !== uid || !rev(current.revision) || !record(current.plan) || !Array.isArray(current.plan.sessions) || !Array.isArray(current.holds) || !current.holds.every(id)) blocked("invalid-authority");
    if (receipt.exists) {
      const prior = receipt.data();
      if (!record(prior) || prior.schemaVersion !== 1 || prior.accountId !== uid || prior.requestId !== request.requestId || prior.fingerprint !== fingerprint || prior.raceGoalId !== request.raceGoalId ||
          prior.baseRevision !== request.expectedRevision || !rev(prior.appliedRevision) || prior.appliedRevision !== prior.baseRevision + 1 || prior.appliedRevision > current.revision || !isDeepStrictEqual(prior.acceptedRunWalkStage, acceptedRunWalkStage) || !isDeepStrictEqual(prior.sessions, sessions) || !rev(prior.confirmedAtMs)) blocked("adoption-request-conflict");
      return { outcome: "replayed", receipt: prior };
    }
    if (current.revision !== request.expectedRevision || current.plan.raceGoalId !== request.raceGoalId) blocked("revision-conflict");
    if (current.revision === Number.MAX_SAFE_INTEGER) blocked("revision-exhausted");
    if (current.migration?.version !== 1 || current.migration.status !== "complete") blocked("migration-required");
    if (current.holds.length) blocked("active-hold");
    if (current.acceptedRunWalkStage !== undefined) blocked("initial-stage-already-adopted");
    if (current.plan.sessions.length) blocked("initial-plan-not-empty");
    // A goal ID alone cannot establish race day or training feasibility. Keep
    // race adoption held until an authoritative dated goal contract exists.
    if (current.plan.raceGoalId !== null || (current.savedRaceGoal !== undefined && current.savedRaceGoal !== null)) blocked("race-adoption-not-supported");
    const c = current.constraints;
    const marker = c?.reviewConfirmation;
    if (!record(marker) || marker.version !== 1 || marker.confirmed !== true || marker.authorityRevision !== current.revision || marker.raceGoalId !== current.plan.raceGoalId || !validateCanonicalReview(current, uid)) blocked("current-review-required");
    if (c.symptoms !== "none") blocked("symptom-review-required");
    const restrictions = c.restrictions;
    if (c.capacity.longestMinutes < 29 || request.dates.length > c.capacity.daysPerWeek ||
        (restrictions.status === "specified" && (restrictions.noRunning || restrictions.unsupported || (restrictions.maxMinutes !== undefined && restrictions.maxMinutes < 29) || (restrictions.maxDays !== undefined && request.dates.length > restrictions.maxDays)))) blocked("capacity-exceeded");
    const today = Date.parse(localDate(now, current.timeZone));
    if (request.dates.some(d => Date.parse(d) <= today || Date.parse(d) > today + 7 * 86400000)) blocked("future-week-required");
    const saved = { schemaVersion: 1, accountId: uid, requestId: request.requestId, fingerprint, raceGoalId: request.raceGoalId, baseRevision: current.revision, appliedRevision: current.revision + 1, sessions, acceptedRunWalkStage, confirmedAtMs: now };
    tx.set(refs[1], { ...current, revision: current.revision + 1, acceptedRunWalkStage, plan: { ...current.plan, sessions } });
    tx.create(refs[2], saved);
    return { outcome: "adopted", receipt: saved };
  });
}
module.exports = { adoptInitialRunningPlanTransaction };

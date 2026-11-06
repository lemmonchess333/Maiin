/** Point-in-time launch authorization and separate durable app-start evidence.
 * Neither is completion/credit or a durable safety lock.
 * Disabled transport and rollout must both be enabled by a separately validated release. */
"use strict";
const functions = require("firebase-functions/v1");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { isCalendarDate } = require("./dateUtils");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");
const { validateCanonicalReview } = require("./runningReviewTransaction");
const { serverDomainLaunchSession } = require("./generated/runningAdaptationDomain.cjs");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const rev = value => Number.isSafeInteger(value) && value >= 0;
function blocked(errorCode) { throw new functions.https.HttpsError("failed-precondition", "Running session needs to be refreshed.", { errorCode }); }
function localDate(now, zone) {
  try {
    if (typeof zone !== "string" || !zone) throw Error();
    const parts = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
  } catch { blocked("invalid-timezone"); }
}
async function authorize({ firestore, context, data, clock = Date.now }, registering = false) {
  const uid = context?.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  if (data?.expectedUid !== uid) throw new functions.https.HttpsError("cancelled", "The signed-in account changed.");
  if (!id(uid) || !record(data) || Object.keys(data).some(key => !(registering ? ["expectedUid", "expectedRevision", "sessionId", "activityId"] : ["expectedUid", "expectedRevision", "sessionId"]).includes(key)) || !rev(data.expectedRevision) || !id(data.sessionId) || (registering && !id(data.activityId)))
    throw new functions.https.HttpsError("invalid-argument", "Invalid launch request.");
  const expectedRevision = data.expectedRevision, sessionId = data.sessionId;
  const activityId = registering ? data.activityId : null;
  const launchId = registering ? `launch_${createHash("sha256").update(JSON.stringify([uid, activityId])).digest("hex")}` : null;
  const refs = [`users/${uid}`, `users/${uid}/runningState/current`, `${ledger.COLLECTION}/${uid}`, `${tombstones.COLLECTION}/${uid}`, "system/runningAuthority", ...(registering ? [`users/${uid}/runningState/${launchId}`, `users/${uid}/runs/${activityId}`] : [])].map(path => firestore.doc(path));
  return firestore.runTransaction(async tx => {
    const [profile, authority, deletion, tombstone, rollout, launchReceipt, savedActivity] = await Promise.all(refs.map(ref => tx.get(ref)));
    const now = clock(); if (!rev(now) || now > Number.MAX_SAFE_INTEGER - 15000) blocked("invalid-clock");
    if (deletion.exists && status.isStatusActive(deletion.data().status)) throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
    if (tombstone.exists && status.isTombstoneLive(tombstone.data(), now)) throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
    if (!rollout.exists || rollout.data().protocolVersion !== 1 || rollout.data().enrollmentEnabled !== true || rollout.data().transportEnabled !== true || rollout.data().launchEnabled !== true || (registering && rollout.data().startRegistrationEnabled !== true)) blocked("rollout-disabled");
    if (!profile.exists || !authority.exists) blocked("authority-unavailable");
    const a = authority.data();
    if (!record(a) || a.schemaVersion !== 1 || a.accountId !== uid || !rev(a.revision) || !Array.isArray(a.holds) || !a.holds.every(id) ||
        !record(a.plan) || !(a.plan.raceGoalId === null || id(a.plan.raceGoalId)) || !Array.isArray(a.plan.sessions)) blocked("invalid-authority");
    if (a.revision !== expectedRevision) blocked("revision-conflict");
    if (a.recordedActivityLinks !== undefined && !record(a.recordedActivityLinks)) blocked("invalid-authority");
    if (a.recordedActivityLinks && Object.prototype.hasOwnProperty.call(a.recordedActivityLinks, sessionId)) blocked("session-already-linked");
    if (a.holds.length) blocked("active-hold");
    if (a.migration?.version !== 1 || a.migration.status !== "complete") blocked("migration-required");
    const marker = a.constraints?.reviewConfirmation;
    if (!record(marker) || Object.keys(marker).some(key => !["version", "confirmed", "authorityRevision", "raceGoalId"].includes(key)) || marker.version !== 1 || marker.confirmed !== true ||
        marker.authorityRevision !== a.revision || marker.raceGoalId !== a.plan.raceGoalId || !validateCanonicalReview(a, uid)) blocked("current-review-required");
    const today = localDate(now, a.timeZone);
    const ids = new Set(), dates = new Set();
    for (const row of a.plan.sessions) {
      if (!record(row) || !id(row.id) || !isCalendarDate(row.date) || ids.has(row.id) || dates.has(row.date)) blocked("invalid-prescriptions");
      ids.add(row.id); dates.add(row.date);
    }
    // A later review may lower weekly limits while preserving the plan. Do
    // not launch from an oversized canonical week until it is adapted.
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const monday = todayMs - ((new Date(todayMs).getUTCDay() + 6) % 7) * 86400000;
    const weekCount = a.plan.sessions.filter(row => { const day = Date.parse(`${row.date}T00:00:00Z`); return day >= monday && day < monday + 7 * 86400000; }).length;
    const maxDays = Math.min(a.constraints.capacity.daysPerWeek,
      a.constraints.restrictions.status === "specified" ? a.constraints.restrictions.maxDays ?? 7 : 7);
    if (weekCount > maxDays) blocked("weekly-capacity-exceeded");
    const selected = a.plan.sessions.find(row => row.id === sessionId);
    if (!selected || selected.date !== today) blocked("session-not-today");
    if (a.manualCompletions !== undefined && !record(a.manualCompletions)) blocked("invalid-authority");
    let session;
    try { session = serverDomainLaunchSession({ authority: a, sessionId }); }
    catch (error) { blocked(typeof error.code === "string" ? error.code : "unsupported-template"); }
    // Preflight writes nothing; registration stores app-start authorization only.
    // A later revision/hold may invalidate this immediately;
    // clients must recheck after awaited setup immediately before starting.
    const response = { schemaVersion: 1, accountId: uid, revision: a.revision, raceGoalId: a.plan.raceGoalId,
      session, timeZone: a.timeZone, authorizedAtMs: now, expiresAtMs: now + 15000 };
    if (!registering) return response;
    if (savedActivity.exists) blocked("activity-already-saved");
    if (launchReceipt.exists) {
      const stored = launchReceipt.data();
      const prior = stored?.authorization;
      if (!record(stored) || Object.keys(stored).some(key => !["schemaVersion", "type", "authorization"].includes(key)) || stored.schemaVersion !== 1 || stored.type !== "authorized_app_start" || !record(prior) ||
          !rev(prior.authorizedAtMs) || !rev(prior.expiresAtMs) || prior.authorizedAtMs > now || prior.expiresAtMs !== prior.authorizedAtMs + 15000 ||
          !isDeepStrictEqual(prior, { ...response, authorizedAtMs: prior.authorizedAtMs, expiresAtMs: prior.expiresAtMs, activityId, launchId })) blocked("launch-request-conflict");
      if (now >= prior.expiresAtMs) blocked("launch-authorization-expired");
      return prior;
    }
    const authorization = { ...response, activityId, launchId };
    tx.create(refs[5], { schemaVersion: 1, type: "authorized_app_start", authorization });
    return authorization;
  });
}
function authorizeRunningLaunchTransaction(options) { return authorize(options, false); }
function registerRunningStartTransaction(options) { return authorize(options, true); }
module.exports = { authorizeRunningLaunchTransaction, registerRunningStartTransaction };

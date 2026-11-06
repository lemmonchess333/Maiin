/** Link a user-reported saved activity to a server-authorized app start.
 * This does not verify exercise execution, complete a stage or clear any hold. */
"use strict";
const functions = require("firebase-functions/v1");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const rev = value => Number.isSafeInteger(value) && value >= 0;
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function blocked(errorCode) { throw new functions.https.HttpsError("failed-precondition", "Recorded activity needs reconciliation.", { errorCode }); }
function millis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (record(value) && Number.isSafeInteger(value.seconds) && Number.isInteger(value.nanoseconds) && value.nanoseconds >= 0 && value.nanoseconds < 1e9)
    return value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
  return NaN;
}
async function reconcileRunningActivityTransaction({ firestore, context, data, clock = Date.now }) {
  const uid = context?.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  if (data?.expectedUid !== uid) throw new functions.https.HttpsError("cancelled", "The signed-in account changed.");
  if (!id(uid) || !record(data) || Object.keys(data).some(key => !["expectedUid", "expectedRevision", "activityId"].includes(key)) || !rev(data.expectedRevision) || !id(data.activityId))
    throw new functions.https.HttpsError("invalid-argument", "Invalid activity reconciliation request.");
  const activityId = data.activityId, expectedRevision = data.expectedRevision;
  const identity = hash([uid, activityId]), launchId = `launch_${identity}`;
  const refs = [`users/${uid}`, `users/${uid}/runningState/current`, `users/${uid}/runningState/${launchId}`,
    `users/${uid}/runs/${activityId}`, `users/${uid}/runningState/activity_${identity}`,
    `${ledger.COLLECTION}/${uid}`, `${tombstones.COLLECTION}/${uid}`, "system/runningAuthority"].map(path => firestore.doc(path));
  return firestore.runTransaction(async tx => {
    const [profile, authority, launch, saved, receipt, deletion, tombstone, rollout] = await Promise.all(refs.map(ref => tx.get(ref)));
    const now = clock(); if (!rev(now)) blocked("invalid-clock");
    if (deletion.exists && status.isStatusActive(deletion.data().status)) throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
    if (tombstone.exists && status.isTombstoneLive(tombstone.data(), now)) throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
    if (!rollout.exists || rollout.data().protocolVersion !== 1 || rollout.data().enrollmentEnabled !== true || rollout.data().transportEnabled !== true || rollout.data().completionEnabled !== true) blocked("rollout-disabled");
    if (!profile.exists || !authority.exists || !launch.exists || !saved.exists) blocked("evidence-unavailable");
    const current = authority.data(), start = launch.data(), activity = saved.data(), proof = start?.authorization;
    if (!record(current) || current.schemaVersion !== 1 || current.accountId !== uid || !rev(current.revision) ||
        !record(current.plan) || !Array.isArray(current.plan.sessions) || !Array.isArray(current.holds) || !current.holds.every(id) ||
        current.migration?.version !== 1 || current.migration.status !== "complete" ||
        (current.recordedActivityLinks !== undefined && !record(current.recordedActivityLinks)) ||
        (current.manualCompletions !== undefined && !record(current.manualCompletions))) blocked("invalid-authority");
    if (!record(start) || start.schemaVersion !== 1 || start.type !== "authorized_app_start" || !record(proof) ||
        proof.schemaVersion !== 1 || proof.accountId !== uid || proof.activityId !== activityId || proof.launchId !== launchId || !rev(proof.revision) || proof.revision > current.revision ||
        !rev(proof.authorizedAtMs) || !rev(proof.expiresAtMs) || proof.expiresAtMs !== proof.authorizedAtMs + 15000 ||
        !record(proof.session) || !id(proof.session.id)) blocked("invalid-start-evidence");
    // A valid authorized app start and these user-reported values are only
    // recording provenance. They cannot establish prescribed interval execution.
    const began = millis(activity.recordingStartedAt), ended = millis(activity.recordingEndedAt);
    if (activity.type !== "run" || activity.isInvalid !== false || activity.savedAnyway === true || activity.legacyPlanClaimExcluded !== true ||
        !record(activity.runConfig) || activity.runConfig.legacyPlanClaimExcluded !== true || !isDeepStrictEqual(activity.runConfig.canonicalLaunch, proof) ||
        activity.date !== proof.session.date || !rev(began) || !rev(ended) || began < proof.authorizedAtMs || began >= proof.expiresAtMs ||
        ended <= began || ended > now || ended - began > 86400000 ||
        !Number.isFinite(activity.duration) || activity.duration <= 0 || activity.duration > (ended - began) / 1000 + 1 ||
        !Number.isFinite(activity.distance) || activity.distance < 0) blocked("incompatible-saved-activity");
    const evidence = { recordingStartedAtMs: began, recordingEndedAtMs: ended, durationSeconds: activity.duration, distanceMeters: activity.distance };
    const fingerprint = hash({ accountId: uid, activityId, expectedRevision, launchId, session: proof.session,
      launchRevision: proof.revision, authorizedAtMs: proof.authorizedAtMs, expiresAtMs: proof.expiresAtMs, timeZone: proof.timeZone, raceGoalId: proof.raceGoalId, evidence });
    const links = current.recordedActivityLinks || {};
    if (receipt.exists) {
      const prior = receipt.data();
      const link = links[proof.session.id];
      if (!record(prior) || prior.schemaVersion !== 1 || prior.accountId !== uid || prior.activityId !== activityId || prior.launchId !== launchId || prior.sessionId !== proof.session.id ||
          prior.fingerprint !== fingerprint || prior.baseRevision !== expectedRevision || !rev(prior.appliedRevision) || prior.appliedRevision !== prior.baseRevision + 1 || prior.appliedRevision > current.revision ||
          prior.classification !== "user_reported_activity" || prior.progressionEligible !== false || !rev(prior.recordedAtMs) || prior.recordedAtMs > now ||
          !isDeepStrictEqual(prior.evidence, evidence) || !isDeepStrictEqual(link, { activityId, launchId, classification: "user_reported_activity", progressionEligible: false, recordedAtMs: prior.recordedAtMs })) blocked("activity-reconciliation-conflict");
      return { outcome: "replayed", receipt: prior };
    }
    if (proof.raceGoalId !== current.plan.raceGoalId || proof.timeZone !== current.timeZone) blocked("session-changed");
    const rows = current.plan.sessions.filter(row => row?.id === proof.session.id);
    const row = rows[0];
    if (rows.length !== 1 || !record(row) || Object.keys(row).some(key => !["id", "date", "templateId", "minutes", "kind", "completed", "protected", "status"].includes(key)) ||
        (owns(row, "completed") && row.completed !== false) || (owns(row, "protected") && row.protected !== false) || (owns(row, "status") && row.status !== "planned") ||
        !isDeepStrictEqual({ id: row.id, date: row.date, templateId: row.templateId, minutes: row.minutes, kind: row.kind }, proof.session) ||
        (record(current.manualCompletions) && owns(current.manualCompletions, row.id))) blocked("session-changed");
    if (current.revision !== expectedRevision || current.revision >= Number.MAX_SAFE_INTEGER) blocked("revision-conflict");
    if (owns(links, proof.session.id)) blocked("session-already-linked");
    const link = { activityId, launchId, classification: "user_reported_activity", progressionEligible: false, recordedAtMs: now };
    const savedReceipt = { schemaVersion: 1, accountId: uid, activityId, launchId, sessionId: proof.session.id, fingerprint,
      baseRevision: current.revision, appliedRevision: current.revision + 1, ...link, evidence };
    // Preserve all independent holds, raw history, plan and review fields.
    // Review confirmation intentionally becomes stale after this evidence change.
    tx.set(refs[1], { ...current, revision: current.revision + 1, recordedActivityLinks: { ...links, [proof.session.id]: link } });
    tx.create(refs[4], savedReceipt);
    return { outcome: "linked", receipt: savedReceipt };
  });
}
module.exports = { reconcileRunningActivityTransaction };

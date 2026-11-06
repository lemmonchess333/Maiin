/**
 * Held-only enrollment and authenticated negotiation stay dormant
 * until all prescribed-entry gates, migration review, writer revisions and
 * real emulator/device validation pass. Callable transport is installed but defaults off.
 */
"use strict";
const functions = require("firebase-functions/v1");
const { createHash } = require("node:crypto");
const { reconcileLegacyRunning } = require("./runningLegacyReconciliation");
const { isCalendarDate } = require("./dateUtils");
const status = require("./accountDeletionStatus");
const locks = require("./accountDeletionLocks");
const ledger = require("./accountDeletionLedger");
const tombstones = require("./deletedAccountsTombstone");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const revision = value => Number.isSafeInteger(value) && value >= 0;
function fail(code, message) { throw new functions.https.HttpsError(code, message); }
function requestOf(data, context, enrolling) {
  const uid = context?.auth?.uid;
  if (!uid) fail("unauthenticated", "Auth required.");
  if (!data || data.expectedUid !== uid) fail("cancelled", "The signed-in account changed.");
  const allowed = enrolling ? ["expectedUid", "supportedSchemaVersions", "confirmed"] : ["expectedUid", "supportedSchemaVersions"];
  if (!id(uid) || !record(data) || Object.keys(data).some(key => !allowed.includes(key)) ||
      !Array.isArray(data.supportedSchemaVersions) || !data.supportedSchemaVersions.length ||
      data.supportedSchemaVersions.length > 4 || !data.supportedSchemaVersions.every(value => Number.isSafeInteger(value) && value > 0) ||
      new Set(data.supportedSchemaVersions).size !== data.supportedSchemaVersions.length ||
      (enrolling && data.confirmed !== true)) fail("invalid-argument", "Invalid running authority request.");
  return { uid, supportedSchemaVersions: [...data.supportedSchemaVersions] };
}
function nowAt(clock) {
  const now = clock(); if (!revision(now)) fail("internal", "Invalid server clock."); return now;
}
function zoneValid(value) {
  if (typeof value !== "string" || !value) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0)); return true; } catch { return false; }
}
function blocked(uid, checkedAtMs, reason, state = "unavailable") {
  return { status: state, accountId: uid, checkedAtMs, reason };
}
function negotiateSnapshot(current, request, checkedAtMs) {
  if (!current) return blocked(request.uid, checkedAtMs, "not_enrolled", "not_enrolled");
  if (current.schemaVersion !== 1 || !request.supportedSchemaVersions.includes(current.schemaVersion))
    return blocked(request.uid, checkedAtMs, "unsupported_schema");
  if (current.accountId !== request.uid || !revision(current.revision) || !zoneValid(current.timeZone) ||
      !record(current.constraints) || !Array.isArray(current.holds) || !current.holds.every(id) ||
      !record(current.plan) || !(current.plan.raceGoalId === null || id(current.plan.raceGoalId)) || !Array.isArray(current.plan.sessions))
    return blocked(request.uid, checkedAtMs, "invalid_authority");
  if (owns(current, "recordedActivityLinks") && (!record(current.recordedActivityLinks) || Object.entries(current.recordedActivityLinks).some(([sessionId, link]) =>
      !id(sessionId) || !record(link) || Object.keys(link).some(key => !["activityId", "launchId", "classification", "progressionEligible", "recordedAtMs"].includes(key)) ||
      !id(link.activityId) || typeof link.launchId !== "string" || !/^launch_[a-f0-9]{64}$/.test(link.launchId) ||
      link.classification !== "user_reported_activity" || link.progressionEligible !== false || !revision(link.recordedAtMs))))
    return blocked(request.uid, checkedAtMs, "invalid_activity_links");
  if (owns(current, "migration") && (!record(current.migration) || current.migration.version !== 1 ||
      !["review_required", "complete"].includes(current.migration.status)))
    return blocked(request.uid, checkedAtMs, "invalid_migration");
  // An unfinished migration blocks independently of holds. A faulty future
  // writer dropping a hold must not turn an unresolved migration into readiness.
  const pendingMigration = current.migration?.status === "review_required";
  const holds = pendingMigration ? [...new Set([...current.holds, "enrollment_review_required"])] : current.holds;
  // Even a stale/corrupt persisted schedule is never offered during a hold.
  if (holds.length) return { status: "held", accountId: request.uid, checkedAtMs,
    schemaVersion: 1, revision: current.revision,
    authority: { ...current, holds, plan: { ...current.plan, sessions: [] } },
    reason: pendingMigration ? "migration_review_required" : "running_hold" };
  const seen = new Set(); const dates = new Set();
  for (const row of current.plan.sessions) {
    if (!record(row) || !id(row.id) || seen.has(row.id) || dates.has(row.date) || !id(row.templateId) || !isCalendarDate(row.date) ||
        !Number.isFinite(row.minutes) || row.minutes <= 0 || !["easy", "run_walk", "quality", "long", "race"].includes(row.kind))
      return blocked(request.uid, checkedAtMs, "invalid_prescriptions");
    if ((owns(row, "completed") && typeof row.completed !== "boolean") ||
        (owns(row, "protected") && typeof row.protected !== "boolean") ||
        (owns(row, "status") && !["planned", "skipped", "race_no_show", "completed_exact", "completed_modified", "completed_late"].includes(row.status)))
      return blocked(request.uid, checkedAtMs, "invalid_prescriptions");
    seen.add(row.id); dates.add(row.date);
  }
  return { status: "ready", accountId: request.uid, checkedAtMs,
    schemaVersion: 1, revision: current.revision, authority: current };
}
function assertAccount(uid, profile, deletion, tombstone, now) {
  if (deletion.exists && status.isStatusActive(deletion.data().status))
    throw locks.wrapAsHttpsError(status.makeAccountDeletingError(uid));
  if (tombstone.exists && status.isTombstoneLive(tombstone.data(), now))
    throw locks.wrapAsHttpsError(status.makeAccountDeletedError(uid));
  if (!profile.exists) fail("failed-precondition", "Account is unavailable.");
}
function refsFor(firestore, uid) {
  return {
    profile: firestore.doc(`users/${uid}`),
    authority: firestore.doc(`users/${uid}/runningState/current`),
    // The exact legacy document is snapshotted without envelope overhead or
    // truncation. Existing history/manual entries survive even if an old client
    // later rewrites the legacy document. This is not new prescription input.
    snapshot: firestore.doc(`users/${uid}/runningState/legacySnapshot`),
    legacy: firestore.doc(`users/${uid}/programState/current`),
    rollout: firestore.doc("system/runningAuthority"),
    deletion: firestore.doc(`${ledger.COLLECTION}/${uid}`),
    tombstone: firestore.doc(`${tombstones.COLLECTION}/${uid}`),
  };
}
function rolloutReady(snapshot) {
  return snapshot.exists && snapshot.data().protocolVersion === 1 && snapshot.data().enrollmentEnabled === true;
}
async function negotiateRunningAuthority({ firestore, context, data, clock = Date.now }) {
  const request = requestOf(data, context, false); const refs = refsFor(firestore, request.uid);
  return firestore.runTransaction(async tx => {
    const [profile, authority, rollout, deletion, tombstone, snapshot] = await Promise.all(
      [refs.profile, refs.authority, refs.rollout, refs.deletion, refs.tombstone, refs.snapshot].map(ref => tx.get(ref)));
    const now = nowAt(clock); assertAccount(request.uid, profile, deletion, tombstone, now);
    if (!rolloutReady(rollout)) return blocked(request.uid, now, "rollout_disabled");
    const response = negotiateSnapshot(authority.exists ? authority.data() : null, request, now);
    if (snapshot.exists && authority.exists && authority.data().migration?.status === "review_required" && authority.data().migration?.legacyStateExisted === true)
      response.legacyReconciliation = reconcileLegacyRunning(snapshot.data());
    return response;
  });
}
function savedGoal(profile, legacy) {
  return Object.prototype.hasOwnProperty.call(profile, "raceGoal") ? profile.raceGoal : legacy.runPlan?.raceGoal ?? null;
}
function goalId(goal) {
  if (!record(goal) || !["5k", "10k", "half", "marathon"].includes(goal.distance) || !isCalendarDate(goal.targetDate)) return null;
  return createHash("sha256").update(JSON.stringify([goal.distance, goal.targetDate, goal.eventSpaceId ?? null])).digest("hex");
}
async function enrollRunningAuthority({ firestore, context, data, clock = Date.now }) {
  const request = requestOf(data, context, true); const refs = refsFor(firestore, request.uid);
  return firestore.runTransaction(async tx => {
    const [profile, authority, snapshot, legacySnap, rollout, deletion, tombstone] = await Promise.all(
      [refs.profile, refs.authority, refs.snapshot, refs.legacy, refs.rollout, refs.deletion, refs.tombstone].map(ref => tx.get(ref)));
    const now = nowAt(clock); assertAccount(request.uid, profile, deletion, tombstone, now);
    if (!rolloutReady(rollout)) return blocked(request.uid, now, "rollout_disabled");
    if (!request.supportedSchemaVersions.includes(1)) return blocked(request.uid, now, "unsupported_schema");
    if (authority.exists) return negotiateSnapshot(authority.data(), request, now);
    if (snapshot.exists) return blocked(request.uid, now, "migration_incomplete");
    const user = profile.data();
    if (!zoneValid(user.timezone)) return blocked(request.uid, now, "timezone_required");
    const legacy = legacySnap.exists ? legacySnap.data() : {};
    const goal = savedGoal(user, legacy); const raceGoalId = goalId(goal);
    const holds = ["enrollment_review_required"];
    if (legacy.runPlan?.phase === "recovery") holds.push("recovery_evidence_required");
    if (goal !== null && raceGoalId === null) holds.push("goal_review_required");
    const current = { schemaVersion: 1, accountId: request.uid, revision: 0, timeZone: user.timezone,
      plan: { raceGoalId, sessions: [] }, holds,
      constraints: { symptoms: "unknown", capacity: { confirmed: false, afterEffectsReviewed: false,
        daysPerWeek: null, longestMinutes: null }, restrictions: { status: "unknown" } },
      savedRaceGoal: goal ?? null,
      migration: { version: 1, enrolledAtMs: now, legacyStateExisted: legacySnap.exists,
        legacySnapshotId: "legacySnapshot", status: "review_required", initialReviewPending: true } };
    // This NEVER adopts old prescriptions, inferred capacity, or completion from
    // a scheduled race date. Verified migration/status review is a later command.
    tx.create(refs.snapshot, legacy);
    tx.create(refs.authority, current);
    return negotiateSnapshot(current, request, now);
  });
}
module.exports = { negotiateRunningAuthority, enrollRunningAuthority };

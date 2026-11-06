import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { enrollRunningAuthority: enroll, negotiateRunningAuthority: negotiate } = require("../lib/runningEnrollment");
const { saveRunningReviewTransaction: review } = require("../lib/runningReviewTransaction");
const { completeRunningMigrationTransaction: migrate } = require("../lib/runningMigrationTransaction");
const { adoptInitialRunningPlanTransaction: adopt } = require("../lib/runningInitialPlanTransaction");
const { authorizeRunningLaunchTransaction: launch, registerRunningStartTransaction: register } = require("../lib/runningLaunchTransaction");
const { reconcileRunningActivityTransaction: link } = require("../lib/runningActivityReconciliation");
const PATH = "users/runner/runningState/current", NOW = Date.parse("2026-11-06T12:00:00Z");
async function fixture() {
  const firestore = memoryFirestore({ "users/runner": { timezone: "UTC" }, "system/runningAuthority": { protocolVersion: 1,
    enrollmentEnabled: true, transportEnabled: true, migrationEnabled: true, initialPlanEnabled: true, launchEnabled: true, startRegistrationEnabled: true, completionEnabled: true } });
  let now = NOW;
  const input = { firestore, context: { auth: { uid: "runner" } }, clock: () => now };
  const reviewData = { expectedUid: "runner", expectedRevision: 0, requestId: "r1", raceGoalId: null, confirmed: true,
    review: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 30 }, restrictions: { status: "none" } } };
  await enroll({ ...input, data: { expectedUid: "runner", supportedSchemaVersions: [1], confirmed: true } });
  await review({ ...input, data: reviewData });
  await migrate({ ...input, data: { expectedUid: "runner", expectedRevision: 1, requestId: "m1", raceGoalId: null, confirmed: true, acknowledgedLegacyPrescriptionsRetired: true } });
  await review({ ...input, data: { ...reviewData, expectedRevision: 2, requestId: "r2" } });
  await adopt({ ...input, data: { expectedUid: "runner", expectedRevision: 3, requestId: "a1", raceGoalId: null, confirmed: true, confirmationVersion: "initial-run-walk-v1", dates: ["2026-11-07", "2026-11-09"] } });
  now += 86400000;
  await review({ ...input, data: { ...reviewData, expectedRevision: 4, requestId: "r3" } });
  const proof = await register({ ...input, data: { expectedUid: "runner", expectedRevision: 5, sessionId: "initial_20261107", activityId: "activity1" } });
  const activity = { type: "run", isInvalid: false, savedAnyway: false, legacyPlanClaimExcluded: true,
    runConfig: { canonicalLaunch: proof, legacyPlanClaimExcluded: true }, date: "2026-11-07",
    recordingStartedAt: new Date(now + 1000), recordingEndedAt: new Date(now + 121000), duration: 120, distance: 100 };
  const save = () => { firestore.data.set("users/runner/runs/activity1", activity); now += 122000; };
  return { input, firestore, proof, activity, save, reviewData, setNow: value => { now = value; }, data: { expectedUid: "runner", expectedRevision: 5, activityId: "activity1" } };
}
describe("recorded activity reconciliation", () => {
  it("real register/save/link/negotiate/next-session path preserves raw history and requires explicit renewed review", async () => {
    const f = await fixture(); f.save(); const before = structuredClone(f.firestore.data.get(PATH)), saved = structuredClone(f.activity);
    const result = await link({ ...f.input, data: f.data });
    expect(result.outcome).toBe("linked"); expect(result.receipt.classification).toBe("user_reported_activity"); expect(result.receipt.progressionEligible).toBe(false);
    const current = f.firestore.data.get(PATH);
    expect(current.plan).toEqual(before.plan); expect(current.constraints).toEqual(before.constraints); expect(current.holds).toEqual(before.holds);
    expect(current.acceptedRunWalkStage).toEqual(before.acceptedRunWalkStage); expect(f.firestore.data.get("users/runner/runs/activity1")).toEqual(saved);
    expect(current.revision).toBe(6);
    const negotiation = await negotiate({ ...f.input, data: { expectedUid: "runner", supportedSchemaVersions: [1] } });
    expect(negotiation.authority.recordedActivityLinks.initial_20261107.activityId).toBe("activity1");
    await expect(launch({ ...f.input, data: { expectedUid: "runner", expectedRevision: 6, sessionId: "initial_20261107" } })).rejects.toMatchObject({ details: { errorCode: "session-already-linked" } });
    f.setNow(NOW + 3 * 86400000);
    await expect(launch({ ...f.input, data: { expectedUid: "runner", expectedRevision: 6, sessionId: "initial_20261109" } })).rejects.toMatchObject({ details: { errorCode: "current-review-required" } });
    await review({ ...f.input, data: { ...f.reviewData, expectedRevision: 6, requestId: "r4" } });
    expect((await launch({ ...f.input, data: { expectedUid: "runner", expectedRevision: 7, sessionId: "initial_20261109" } })).session.id).toBe("initial_20261109");
  });
  it("replays exact recorded linkage without another revision and refuses edited facts", async () => {
    const f = await fixture(); f.save(); const result = await link({ ...f.input, data: f.data }), count = f.firestore.operations.length;
    expect(await link({ ...f.input, data: f.data })).toEqual({ ...result, outcome: "replayed" }); expect(f.firestore.operations).toHaveLength(count);
    f.activity.duration = 119; await expect(link({ ...f.input, data: f.data })).rejects.toMatchObject({ details: { errorCode: "activity-reconciliation-conflict" } });
  });
  it("exact replay remains a historical receipt after later goal, timezone and plan changes", async () => {
    const f = await fixture(); f.save(); const result = await link({ ...f.input, data: f.data });
    const current = f.firestore.data.get(PATH); current.revision += 1; current.plan = { raceGoalId: "new_goal", sessions: [] }; current.timeZone = "Europe/London";
    const before = structuredClone(current); expect(await link({ ...f.input, data: f.data })).toEqual({ ...result, outcome: "replayed" });
    expect(f.firestore.data.get(PATH)).toEqual(before);
  });
  it.each(["receipt_only", "canceled_start", "foreign_saved", "missing_proof", "forged_proof", "bad_markers", "invalid_run", "early_start", "late_start", "future_end", "duration", "session_changed", "revision", "deletion", "rollout"])("does not link %s", async kind => {
    const f = await fixture();
    if (!["receipt_only", "canceled_start", "foreign_saved"].includes(kind)) f.save();
    if (kind === "foreign_saved") f.firestore.data.set("users/other/runs/activity1", f.activity);
    if (kind === "missing_proof") f.firestore.data.delete(`users/runner/runningState/${f.proof.launchId}`);
    if (kind === "forged_proof") f.activity.runConfig.canonicalLaunch = { ...f.proof, revision: 99 };
    if (kind === "bad_markers") f.activity.legacyPlanClaimExcluded = false;
    if (kind === "invalid_run") f.activity.isInvalid = true;
    if (kind === "early_start") f.activity.recordingStartedAt = new Date(f.proof.authorizedAtMs - 1);
    if (kind === "late_start") f.activity.recordingStartedAt = new Date(f.proof.expiresAtMs);
    if (kind === "future_end") f.activity.recordingEndedAt = new Date(NOW + 99 * 86400000);
    if (kind === "duration") f.activity.duration = 10000;
    if (kind === "session_changed") f.firestore.data.get(PATH).plan.sessions[0].minutes = 10;
    if (kind === "revision") f.data.expectedRevision = 4;
    if (kind === "deletion") f.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    if (kind === "rollout") f.firestore.data.get("system/runningAuthority").completionEnabled = false;
    const before = structuredClone(f.firestore.data.get(PATH)); await expect(link({ ...f.input, data: f.data })).rejects.toBeDefined();
    expect(f.firestore.data.get(PATH)).toEqual(before); expect(f.firestore.data.get(PATH).recordedActivityLinks).toBeUndefined();
  });
  it("records partial user activity without clearing a later safety hold", async () => {
    const f = await fixture(); f.save(); f.firestore.data.get(PATH).holds = ["injury", "user_pause"];
    const result = await link({ ...f.input, data: f.data });
    expect(result.receipt.evidence.durationSeconds).toBe(120); expect(result.receipt.progressionEligible).toBe(false);
    expect(f.firestore.data.get(PATH).holds).toEqual(["injury", "user_pause"]);
  });
  it("deletion is checked before exact replay", async () => {
    const f = await fixture(); f.save(); await link({ ...f.input, data: f.data });
    f.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    await expect(link({ ...f.input, data: f.data })).rejects.toMatchObject({ details: { errorCode: "account-deleting" } });
  });
  it.each([{}, { expectedUid: "other" }, { expectedUid: "runner", expectedRevision: 5, activityId: "activity1", completed: true }])("rejects unauthoritative request facts %j", async data => {
    const f = await fixture(); f.save(); await expect(link({ ...f.input, data })).rejects.toBeDefined();
    expect(f.firestore.data.get(PATH).recordedActivityLinks).toBeUndefined();
  });
  it("unauthenticated caller cannot reconcile", async () => {
    const f = await fixture(); f.save(); await expect(link({ ...f.input, context: {}, data: f.data })).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("atomic receipt failure leaves authority untouched", async () => {
    const f = await fixture(); f.save(); const before = structuredClone(f.firestore.data.get(PATH));
    f.firestore.failures.set(`create:users/runner/runningState/activity_${f.proof.launchId.slice(7)}`, new Error("injected"));
    await expect(link({ ...f.input, data: f.data })).rejects.toThrow("injected"); expect(f.firestore.data.get(PATH)).toEqual(before);
  });
});

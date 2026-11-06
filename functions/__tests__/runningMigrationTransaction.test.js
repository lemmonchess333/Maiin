import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { enrollRunningAuthority: enroll, negotiateRunningAuthority: negotiate } = require("../lib/runningEnrollment");
const { saveRunningReviewTransaction: review } = require("../lib/runningReviewTransaction");
const { completeRunningMigrationTransaction: complete } = require("../lib/runningMigrationTransaction");
const { reconcileLegacyRunning } = require("../lib/runningLegacyReconciliation");
const path = "users/runner/runningState/current";
const NOW = Date.parse("2026-11-06T12:00:00Z");
async function fixture(legacy) {
  const firestore = memoryFirestore({ "users/runner": { timezone: "UTC" }, "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true, migrationEnabled: true },
    ...(legacy ? { "users/runner/programState/current": legacy } : {}) });
  const input = { firestore, context: { auth: { uid: "runner" } }, clock: () => NOW };
  await enroll({ ...input, data: { expectedUid: "runner", supportedSchemaVersions: [1], confirmed: true } });
  const reviewData = { expectedUid: "runner", expectedRevision: 0, requestId: "review1", raceGoalId: null, confirmed: true,
    review: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 20 }, restrictions: { status: "none" } } };
  return { input, reviewData, data: { expectedUid: "runner", expectedRevision: 1, requestId: "migration1", raceGoalId: null, confirmed: true, acknowledgedLegacyPrescriptionsRetired: true } };
}
describe("empty-history enrollment migration", () => {
  it.each([{}, { runPlan: { mode: "starter", stage: 1 }, runDays: [] }, { injury: "unmapped" }, { runPlan: { mode: "race_prep", phase: "recovery" } }])("explicit digest-bound legacy review preserves snapshot and mapped holds %j", async legacy => {
    const f = await fixture(legacy); await review({ ...f.input, data: f.reviewData });
    const facts = reconcileLegacyRunning(legacy);
    expect((await negotiate({ ...f.input, data: { expectedUid: "runner", supportedSchemaVersions: [1] } })).legacyReconciliation).toEqual(facts);
    const before = structuredClone(f.input.firestore.data.get(path));
    await complete({ ...f.input, data: { ...f.data, expectedLegacyDigest: facts.snapshotDigest, confirmedLegacyReview: true } });
    const current = f.input.firestore.data.get(path);
    expect(current.holds).toEqual(expect.arrayContaining(facts.holds));
    expect(current.holds).not.toContain("enrollment_review_required"); expect(current.plan).toEqual(before.plan); expect(current.constraints).toEqual(before.constraints);
    expect(current.migration.reconciliation).toEqual(facts);
    expect(f.input.firestore.data.get("users/runner/runningState/legacySnapshot")).toEqual(legacy);
    expect(f.input.firestore.data.get("users/runner/programState/current")).toEqual(legacy);
  });
  it.each(["consent", "digest", "changed_live", "deleted_live"])("blocks legacy %s mismatch", async kind => {
    const legacy = { runPlan: { mode: "starter" } }; const f = await fixture(legacy); await review({ ...f.input, data: f.reviewData });
    const data = { ...f.data, expectedLegacyDigest: reconcileLegacyRunning(legacy).snapshotDigest, confirmedLegacyReview: true };
    if (kind === "consent") delete data.confirmedLegacyReview;
    if (kind === "digest") data.expectedLegacyDigest = "a".repeat(64);
    if (kind === "changed_live") f.input.firestore.data.set("users/runner/programState/current", { ...legacy, injury: true });
    if (kind === "deleted_live") f.input.firestore.data.delete("users/runner/programState/current");
    await expect(complete({ ...f.input, data })).rejects.toBeDefined();
  });

  it("real enrollment -> first safe review -> completion preserves account/snapshot and retires only enrollment hold", async () => {
    const f = await fixture(); await review({ ...f.input, data: f.reviewData });
    expect(f.input.firestore.data.get(path).holds).toEqual(["enrollment_review_required"]);
    const before = structuredClone(f.input.firestore.data.get(path));
    const result = await complete({ ...f.input, data: f.data });
    const current = f.input.firestore.data.get(path);
    expect(current).toEqual({ ...before, revision: 2, holds: [], migration: { ...before.migration, status: "complete", completedAtMs: NOW } });
    expect(current.constraints.reviewConfirmation.authorityRevision).toBe(1);
    expect(f.input.firestore.data.get("users/runner")).toEqual({ timezone: "UTC" });
    expect(f.input.firestore.data.get("users/runner/runningState/legacySnapshot")).toEqual({});
    expect(await complete({ ...f.input, data: f.data })).toEqual({ ...result, outcome: "replayed" });
  });
  it.each(["injury", "recovery_evidence_required", "running_review_required", "unknown_hold"])("preserves %s", async hold => {
    const f = await fixture(); f.input.firestore.data.get(path).holds.push(hold);
    await review({ ...f.input, data: f.reviewData }); await complete({ ...f.input, data: f.data });
    expect(f.input.firestore.data.get(path).holds).toEqual([hold]);
  });
  it.each(["concerning", "unknown", "daily_activities", "during_or_after"])("first %s review is held and cannot be erased", async symptoms => {
    const f = await fixture(); f.reviewData.review.symptoms = symptoms;
    await review({ ...f.input, data: f.reviewData });
    expect(f.input.firestore.data.get(path).migration.initialReviewPending).toBe(false);
    expect(f.input.firestore.data.get(path).holds).toContain("running_review_required");
    await expect(complete({ ...f.input, data: f.data })).rejects.toBeDefined();
    await review({ ...f.input, data: { ...f.reviewData, expectedRevision: 1, requestId: "review2", review: { ...f.reviewData.review, symptoms: "none" } } });
    expect(f.input.firestore.data.get(path).holds).toContain("running_review_required");
  });
  it.each([{}, { runPlan: { phase: "recovery" } }, { injury: "unmapped" }])("does not treat preserved legacy facts as reconciled: %j", async legacy => {
    const f = await fixture(legacy); await review({ ...f.input, data: f.reviewData });
    await expect(complete({ ...f.input, data: f.data })).rejects.toMatchObject({ details: { errorCode: "legacy-reconciliation-required" } });
  });
  it.each(["marker", "revision", "extra", "prior_symptom"])("does not exempt noninitial %s state", async kind => {
    const f = await fixture(); const current = f.input.firestore.data.get(path);
    if (kind === "marker") delete current.migration.initialReviewPending;
    if (kind === "revision") { current.revision = 2; f.reviewData.expectedRevision = 2; }
    if (kind === "extra") current.constraints.confirmedEasyPaceSecondsPerKm = 500;
    if (kind === "prior_symptom") current.constraints.symptoms = "concerning";
    await review({ ...f.input, data: f.reviewData }); expect(f.input.firestore.data.get(path).holds).toContain("running_review_required");
  });
  it.each(["stale", "missing_snapshot", "deleting", "tombstone", "unsafe_snapshot", "future_marker", "rollout", "nonempty_plan", "late_legacy"])("fails closed for %s", async kind => {
    const f = await fixture(); await review({ ...f.input, data: f.reviewData });
    if (kind === "late_legacy") f.input.firestore.data.set("users/runner/programState/current", { runPlan: { phase: "recovery" } });
    if (kind === "rollout") f.input.firestore.data.delete("system/runningAuthority");
    if (kind === "nonempty_plan") f.input.firestore.data.get(path).plan.sessions.push({ id: "injected" });
    if (kind === "stale") f.data.expectedRevision = 0;
    if (kind === "missing_snapshot") f.input.firestore.data.delete("users/runner/runningState/legacySnapshot");
    if (kind === "deleting") f.input.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    if (kind === "tombstone") f.input.firestore.data.set("deletedAccounts/runner", { expiresAt: "bad" });
    if (kind === "unsafe_snapshot") f.input.firestore.data.set("users/runner/runningState/legacySnapshot", { unknown: true });
    if (kind === "future_marker") f.input.firestore.data.get(path).migration.initialReviewCompletedAtRevision = 999;
    await expect(complete({ ...f.input, data: f.data })).rejects.toBeDefined();
  });
  it("checks deletion before replay and edited reuse conflicts", async () => {
    const f = await fixture(); await review({ ...f.input, data: f.reviewData }); await complete({ ...f.input, data: f.data });
    await expect(complete({ ...f.input, data: { ...f.data, requestId: "edited" } })).rejects.toBeDefined();
    f.input.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    await expect(complete({ ...f.input, data: f.data })).rejects.toMatchObject({ details: { errorCode: "account-deleting" } });
  });
  it("is atomic on receipt failure", async () => {
    const f = await fixture(); await review({ ...f.input, data: f.reviewData }); const before = structuredClone(f.input.firestore.data.get(path));
    f.input.firestore.failures.set("create:users/runner/runningState/migrationReceipt", new Error("injected"));
    await expect(complete({ ...f.input, data: f.data })).rejects.toThrow("injected"); expect(f.input.firestore.data.get(path)).toEqual(before);
  });
  it.each([{ expectedUid: "other" }, { confirmed: false }, { extra: true }, { acknowledgedLegacyPrescriptionsRetired: false }])("rejects invalid request %j", async patch => {
    const f = await fixture(); await expect(complete({ ...f.input, data: { ...f.data, ...patch } })).rejects.toBeDefined();
  });
});

import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { authorizeRunningLaunchTransaction: launch, registerRunningStartTransaction: register } = require("../lib/runningLaunchTransaction");
const { enrollRunningAuthority: enroll } = require("../lib/runningEnrollment");
const { saveRunningReviewTransaction: saveReview } = require("../lib/runningReviewTransaction");
const { completeRunningMigrationTransaction: migrate } = require("../lib/runningMigrationTransaction");
const { adoptInitialRunningPlanTransaction: adopt } = require("../lib/runningInitialPlanTransaction");
const NOW = Date.parse("2026-11-06T12:00:00Z"), PATH = "users/runner/runningState/current";
function fixture() {
  const authority = { schemaVersion: 1, accountId: "runner", revision: 4, timeZone: "UTC", holds: [], migration: { version: 1, status: "complete" },
    plan: { raceGoalId: null, sessions: [{ id: "one", date: "2026-11-06", templateId: "run_walk_1", minutes: 29, kind: "run_walk" }] },
    constraints: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 3, longestMinutes: 30 }, restrictions: { status: "none" },
      reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 4, raceGoalId: null } } };
  const firestore = memoryFirestore({ "users/runner": {}, [PATH]: authority, "system/runningAuthority": { protocolVersion: 1, enrollmentEnabled: true, transportEnabled: true, launchEnabled: true } });
  return { authority, firestore, input: { firestore, context: { auth: { uid: "runner" } }, data: { expectedUid: "runner", expectedRevision: 4, sessionId: "one" }, clock: () => NOW } };
}
describe("canonical launch authorization", () => {
  it("real enrollment/review/migration/adoption requires explicit fresh review before launch", async () => {
    const f = fixture(); f.firestore.data.delete(PATH);
    f.firestore.data.set("users/runner", { timezone: "UTC" });
    Object.assign(f.firestore.data.get("system/runningAuthority"), { migrationEnabled: true, initialPlanEnabled: true });
    await enroll({ ...f.input, data: { expectedUid: "runner", supportedSchemaVersions: [1], confirmed: true } });
    const review = { expectedUid: "runner", expectedRevision: 0, requestId: "r1", raceGoalId: null, confirmed: true,
      review: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 30 }, restrictions: { status: "none" } } };
    await saveReview({ ...f.input, data: review });
    await migrate({ ...f.input, data: { expectedUid: "runner", expectedRevision: 1, requestId: "m1", raceGoalId: null, confirmed: true, acknowledgedLegacyPrescriptionsRetired: true } });
    await saveReview({ ...f.input, data: { ...review, expectedRevision: 2, requestId: "r2" } });
    await adopt({ ...f.input, data: { expectedUid: "runner", expectedRevision: 3, requestId: "a1", raceGoalId: null, confirmed: true, confirmationVersion: "initial-run-walk-v1", dates: ["2026-11-07"] } });
    const nextDay = () => NOW + 86400000;
    const request = { expectedUid: "runner", expectedRevision: 4, sessionId: "initial_20261107" };
    await expect(launch({ ...f.input, clock: nextDay, data: request })).rejects.toMatchObject({ details: { errorCode: "current-review-required" } });
    await saveReview({ ...f.input, clock: nextDay, data: { ...review, expectedRevision: 4, requestId: "r3" } });
    const response = await launch({ ...f.input, clock: nextDay, data: { ...request, expectedRevision: 5 } });
    expect(response.session).toEqual({ id: "initial_20261107", date: "2026-11-07", templateId: "run_walk_1", minutes: 29, kind: "run_walk" });
    expect(f.firestore.data.get(PATH).revision).toBe(5);
  });
  it("durably registers exact app-start identity without claiming exercise or changing authority", async () => {
    const f = fixture(); f.firestore.data.get("system/runningAuthority").startRegistrationEnabled = true;
    const before = structuredClone(f.authority), data = { ...f.input.data, activityId: "activity1" };
    const response = await register({ ...f.input, data });
    expect(response.activityId).toBe("activity1"); expect(response.launchId).toMatch(/^launch_[a-f0-9]{64}$/);
    expect(f.firestore.data.get(`users/runner/runningState/${response.launchId}`)).toEqual({ schemaVersion: 1, type: "authorized_app_start", authorization: response });
    expect(f.authority).toEqual(before); expect(f.firestore.operations).toHaveLength(1);
    expect(await register({ ...f.input, data, clock: () => NOW + 1000 })).toEqual(response);
    expect(f.firestore.operations).toHaveLength(1);
  });
  it.each(["disabled", "saved", "expired", "changed_revision", "changed_session", "deletion", "hold"])("registration rejects %s without renewing proof", async kind => {
    const f = fixture(); f.firestore.data.get("system/runningAuthority").startRegistrationEnabled = true;
    const data = { ...f.input.data, activityId: "activity1" }; const response = await register({ ...f.input, data });
    if (kind === "disabled") f.firestore.data.get("system/runningAuthority").startRegistrationEnabled = false;
    if (kind === "saved") f.firestore.data.set("users/runner/runs/activity1", {});
    if (kind === "changed_revision") { f.authority.revision = 5; f.authority.constraints.reviewConfirmation.authorityRevision = 5; data.expectedRevision = 5; }
    if (kind === "changed_session") f.authority.plan.sessions[0].minutes = 1;
    if (kind === "deletion") f.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    if (kind === "hold") f.authority.holds.push("user_pause");
    await expect(register({ ...f.input, data, clock: () => kind === "expired" ? NOW + 15000 : NOW + 1000 })).rejects.toBeDefined();
    expect(f.firestore.data.get(`users/runner/runningState/${response.launchId}`).authorization).toEqual(response);
    expect(f.firestore.operations).toHaveLength(1);
  });
  it("registration snapshots activity identity and fails atomically on receipt write", async () => {
    const f = fixture(); f.firestore.data.get("system/runningAuthority").startRegistrationEnabled = true;
    const data = { ...f.input.data, activityId: "activity1" }; const promise = register({ ...f.input, data }); data.activityId = "other";
    const response = await promise; expect(response.activityId).toBe("activity1");
    const g = fixture(); g.firestore.data.get("system/runningAuthority").startRegistrationEnabled = true;
    g.firestore.failures.set(`create:users/runner/runningState/${response.launchId}`, new Error("injected"));
    await expect(register({ ...g.input, data: { ...g.input.data, activityId: "activity1" } })).rejects.toThrow("injected");
    expect(g.firestore.operations).toEqual([]);
  });
  it("read-only preflight cannot be supplied an activity identity", async () => {
    const f = fixture(); await expect(launch({ ...f.input, data: { ...f.input.data, activityId: "activity1" } })).rejects.toMatchObject({ code: "invalid-argument" });
  });
  it("authorizes only actual catalogue identity with bounded expiry and no writes/credit", async () => {
    const f = fixture(), before = structuredClone(f.authority);
    expect(await launch(f.input)).toEqual({ schemaVersion: 1, accountId: "runner", revision: 4, raceGoalId: null, session: before.plan.sessions[0], timeZone: "UTC", authorizedAtMs: NOW, expiresAtMs: NOW + 15000 });
    expect(f.authority).toEqual(before); expect(f.firestore.operations).toEqual([]);
  });
  it("uses server canonical timezone for today", async () => {
    const f = fixture(); f.authority.timeZone = "Pacific/Honolulu"; f.input.clock = () => Date.parse("2026-11-07T03:00:00Z");
    expect((await launch(f.input)).session.date).toBe("2026-11-06");
  });
  it.each(["hold", "migration", "revision", "review", "goal", "missing_account", "deletion", "tombstone", "rollout", "missing_authority", "timezone", "duplicate_id", "duplicate_date", "manual_shape"])("rejects %s", async kind => {
    const f = fixture();
    if (kind === "hold") f.authority.holds.push("injury");
    if (kind === "migration") f.authority.migration.status = "review_required";
    if (kind === "revision") f.input.data.expectedRevision = 3;
    if (kind === "review") f.authority.constraints.reviewConfirmation.authorityRevision = 3;
    if (kind === "goal") f.authority.constraints.reviewConfirmation.raceGoalId = "other";
    if (kind === "missing_account") f.firestore.data.delete("users/runner");
    if (kind === "missing_authority") f.firestore.data.delete(PATH);
    if (kind === "deletion") f.firestore.data.set("accountDeletionRequests/runner", { status: "running" });
    if (kind === "tombstone") f.firestore.data.set("deletedAccounts/runner", { expiresAt: "bad" });
    if (kind === "rollout") f.firestore.data.delete("system/runningAuthority");
    if (kind === "timezone") f.authority.timeZone = "invalid";
    if (kind === "duplicate_id") f.authority.plan.sessions.push({ ...f.authority.plan.sessions[0], date: "2026-11-07" });
    if (kind === "duplicate_date") f.authority.plan.sessions.push({ ...f.authority.plan.sessions[0], id: "other" });
    if (kind === "manual_shape") f.authority.manualCompletions = [];
    await expect(launch(f.input)).rejects.toBeDefined(); expect(f.firestore.operations).toEqual([]);
  });
  it.each([{ completed: true }, { protected: true }, { status: "completed_exact" }, { status: "skipped" }, { movedToDate: "2026-11-07" }, { userOverride: "marathon_race" }, { minutes: 5 }, { kind: "easy" }, { date: "2026-11-07" }, { date: "2026-11-05" }, { templateId: "fake" }])("rejects nonlaunchable row %j", async patch => {
    const f = fixture(); Object.assign(f.authority.plan.sessions[0], patch); await expect(launch(f.input)).rejects.toBeDefined();
  });
  it.each([false, true, {}, null])("rejects any own manual completion intent %j", async value => {
    const f = fixture(); f.authority.manualCompletions = { one: value }; await expect(launch(f.input)).rejects.toBeDefined();
  });
  it.each([{ symptoms: "concerning" }, { capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 10 } }, { restrictions: { status: "specified", source: "clinician", noRunning: true } }, { restrictions: { status: "specified", source: "clinician", noRunning: false, maxMinutes: 10 } }])("fails closed for unsafe current constraints %j", async patch => {
    const f = fixture(); Object.assign(f.authority.constraints, patch); await expect(launch(f.input)).rejects.toBeDefined();
  });
  it.each(["capacity", "clinician"])("respects reduced weekly %s limit without changing plan", async kind => {
    const f = fixture(); f.authority.plan.sessions.push({ ...f.authority.plan.sessions[0], id: "two", date: "2026-11-07" });
    if (kind === "capacity") f.authority.constraints.capacity.daysPerWeek = 1;
    else f.authority.constraints.restrictions = { status: "specified", source: "clinician", noRunning: false, maxDays: 1 };
    await expect(launch(f.input)).rejects.toMatchObject({ details: { errorCode: "weekly-capacity-exceeded" } });
    expect(f.firestore.operations).toEqual([]);
  });
  it("checks current authority again on every authorization", async () => {
    const f = fixture(); await launch(f.input); f.authority.holds.push("user_pause"); await expect(launch(f.input)).rejects.toMatchObject({ details: { errorCode: "active-hold" } });
  });
  it("snapshots primitives before awaits", async () => {
    const f = fixture(); const result = launch(f.input); f.input.data.sessionId = "other"; expect((await result).session.id).toBe("one");
  });
  it.each([{}, { expectedUid: "other" }, { expectedUid: "runner", expectedRevision: 4, sessionId: "one", templateId: "easy_20" }])("rejects malformed input before references %j", async data => {
    const f = fixture(), firestore = { doc: vi.fn() }; await expect(launch({ ...f.input, firestore, data })).rejects.toBeDefined(); expect(firestore.doc).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated identity before references", async () => {
    const f = fixture(), firestore = { doc: vi.fn() }; await expect(launch({ ...f.input, firestore, context: {} })).rejects.toMatchObject({ code: "unauthenticated" }); expect(firestore.doc).not.toHaveBeenCalled();
  });
});

/** Local emulator only. Skipped cases are not transaction/concurrency proof. */
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), admin = require("firebase-admin");
const { authorizeRunningLaunchTransaction: launch, registerRunningStartTransaction: register } = require("../../lib/runningLaunchTransaction");
const { reconcileRunningActivityTransaction: link } = require("../../lib/runningActivityReconciliation");
const { negotiateRunningAuthority: negotiate } = require("../../lib/runningEnrollment");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !host) throw Error("Launch emulator required.");
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw Error("Local emulator required.");
(host ? describe : describe.skip)("canonical launch real reads", () => {
  let app, db;
  const uid = "launch-runner", now = Date.parse("2026-11-06T12:00:00Z"), path = `users/${uid}/runningState/current`;
  const input = () => ({ firestore: db, context: { auth: { uid } }, data: { expectedUid: uid, expectedRevision: 1, sessionId: "one" }, clock: () => now });
  beforeAll(() => { app = admin.initializeApp({ projectId: "demo-running-launch" }, "running-launch"); db = app.firestore(); });
  afterAll(async () => { await app?.delete(); });
  beforeEach(async () => {
    await db.recursiveDelete(db.doc(`users/${uid}`)); await db.doc(`accountDeletionRequests/${uid}`).delete(); await db.doc(`deletedAccounts/${uid}`).delete();
    await db.doc("system/runningAuthority").set({ protocolVersion: 1, enrollmentEnabled: true, transportEnabled: true, launchEnabled: true, startRegistrationEnabled: true, completionEnabled: true });
    await db.doc(`users/${uid}`).set({ timezone: "UTC" });
    await db.doc(path).set({ schemaVersion: 1, accountId: uid, revision: 1, holds: [], timeZone: "UTC", migration: { version: 1, status: "complete" },
      plan: { raceGoalId: null, sessions: [{ id: "one", date: "2026-11-06", templateId: "run_walk_1", minutes: 29, kind: "run_walk" }] },
      constraints: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 30 }, restrictions: { status: "none" },
        reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 1, raceGoalId: null } } });
  });
  it("concurrent start registration creates one immutable app-start receipt", async () => {
    const request = { ...input(), data: { ...input().data, activityId: "activity1" } };
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => register(request)));
    expect(outcomes.every(value => JSON.stringify(value) === JSON.stringify(outcomes[0]))).toBe(true);
    expect((await db.collection(`users/${uid}/runningState`).get()).size).toBe(2);
    expect((await db.doc(`users/${uid}/runningState/${outcomes[0].launchId}`).get()).data().type).toBe("authorized_app_start");
    expect((await db.doc(path).get()).data().revision).toBe(1);
  });
  it("saved activity identity cannot be registered retrospectively", async () => {
    await db.doc(`users/${uid}/runs/activity1`).set({ type: "run" });
    await expect(register({ ...input(), data: { ...input().data, activityId: "activity1" } })).rejects.toMatchObject({ details: { errorCode: "activity-already-saved" } });
  });
  it("concurrent linkage produces one recorded claim, observable in negotiation", async () => {
    const proof = await register({ ...input(), data: { ...input().data, activityId: "activity1" } });
    await db.doc(`users/${uid}/runs/activity1`).set({ type: "run", isInvalid: false, savedAnyway: false, legacyPlanClaimExcluded: true,
      runConfig: { canonicalLaunch: proof, legacyPlanClaimExcluded: true }, date: "2026-11-06", duration: 120, distance: 100,
      recordingStartedAt: admin.firestore.Timestamp.fromMillis(now + 1000), recordingEndedAt: admin.firestore.Timestamp.fromMillis(now + 121000) });
    const request = { ...input(), clock: () => now + 122000, data: { expectedUid: uid, expectedRevision: 1, activityId: "activity1" } };
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => link(request)));
    expect(outcomes.filter(value => value.outcome === "linked")).toHaveLength(1); expect(outcomes.filter(value => value.outcome === "replayed")).toHaveLength(3);
    const response = await negotiate({ ...input(), clock: () => now + 122000, data: { expectedUid: uid, supportedSchemaVersions: [1] } });
    expect(response.authority.recordedActivityLinks.one.activityId).toBe("activity1");
    expect(response.authority.revision).toBe(2);
    expect(response.authority.plan.sessions[0]).not.toHaveProperty("completed");
  });
  it("receipt alone cannot become recorded completion", async () => {
    await register({ ...input(), data: { ...input().data, activityId: "activity1" } });
    await expect(link({ ...input(), data: { expectedUid: uid, expectedRevision: 1, activityId: "activity1" } })).rejects.toMatchObject({ details: { errorCode: "evidence-unavailable" } });
    expect((await db.doc(path).get()).data().recordedActivityLinks).toBeUndefined();
  });
  it("returns exact current session without writing history/state", async () => {
    const before = (await db.doc(path).get()).data(); expect((await launch(input())).session).toEqual(before.plan.sessions[0]);
    expect((await db.doc(path).get()).data()).toEqual(before); expect((await db.collection(`users/${uid}/runningState`).get()).size).toBe(1);
  });
  it("a new hold invalidates the next direct-before-start recheck", async () => {
    await launch(input()); await db.doc(path).update({ holds: ["user_pause"], revision: 2 });
    await expect(launch(input())).rejects.toBeDefined();
  });
  it("deletion and disabled rollout prevent authorization", async () => {
    await db.doc(`accountDeletionRequests/${uid}`).set({ status: "running" }); await expect(launch(input())).rejects.toBeDefined();
    await db.doc(`accountDeletionRequests/${uid}`).delete(); await db.doc("system/runningAuthority").update({ launchEnabled: false });
    await expect(launch(input())).rejects.toBeDefined();
  });
});

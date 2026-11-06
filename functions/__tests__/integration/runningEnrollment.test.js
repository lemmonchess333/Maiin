/** Real Firestore emulator tests; no mock contention or production project. */
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const {
  enrollRunningAuthority: enroll,
  negotiateRunningAuthority: negotiate,
} = require("../../lib/runningEnrollment");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !host)
  throw Error(
    "FIRESTORE_EMULATOR_HOST required; enrollment transactions did not run."
  );
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
  throw Error("Local emulator required.");
const suite = host ? describe : describe.skip;
suite("held enrollment real transactions", () => {
  let app;
  let db;
  const uid = "enrollment-runner";
  const now = Date.parse("2026-11-06T12:00:00Z");
  const legacyPath = `users/${uid}/programState/current`;
  const currentPath = `users/${uid}/runningState/current`;
  const snapshotPath = `users/${uid}/runningState/legacySnapshot`;
  const legacy = {
    runPlan: {
      phase: "recovery",
      raceGoal: { distance: "marathon", targetDate: "2026-11-01" },
    },
    runDays: Array.from({ length: 140 }, (_, i) => ({
      id: `history-${i}`,
      completed: true,
    })),
    manualCompletions: { "history-139": true },
    workouts: [{ id: "lift" }],
  };
  beforeAll(() => {
    app = admin.initializeApp(
      { projectId: "demo-running-enrollment" },
      "running-enrollment"
    );
    db = app.firestore();
  });
  afterAll(async () => {
    await app?.delete();
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.doc(`accountDeletionRequests/${uid}`).delete();
    await db.doc(`deletedAccounts/${uid}`).delete();
    await db
      .doc("system/runningAuthority")
      .set({ protocolVersion: 1, enrollmentEnabled: true });
    await db.doc(`users/${uid}`).set({ timezone: "UTC" });
    await db.doc(legacyPath).set(legacy);
  });
  const readInput = () => ({
    firestore: db,
    context: { auth: { uid } },
    clock: () => now,
    data: { expectedUid: uid, supportedSchemaVersions: [1] },
  });
  const enrollInput = () => ({
    ...readInput(),
    data: { ...readInput().data, confirmed: true },
  });
  it("parallel enrollment creates one exact history snapshot and one held authority", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => enroll(enrollInput()))
    );
    expect(
      outcomes.every((value) => value.status === "held" && value.revision === 0)
    ).toBe(true);
    expect((await db.doc(snapshotPath).get()).data()).toEqual(legacy);
    expect((await db.collection(`users/${uid}/runningState`).get()).size).toBe(
      2
    );
    expect((await db.doc(currentPath).get()).data().plan.sessions).toEqual([]);
  });
  it("later legacy overwrites cannot replace the canonical hold or immutable history", async () => {
    await enroll(enrollInput());
    await db
      .doc(legacyPath)
      .set({
        runPlan: { phase: "training" },
        runDays: [{ id: "unsafe", date: "2026-11-07" }],
      });
    await enroll(enrollInput());
    expect(await negotiate(readInput())).toMatchObject({
      status: "held",
      authority: { plan: { sessions: [] } },
    });
    expect((await db.doc(snapshotPath).get()).data()).toEqual(legacy);
  });
  it("concurrent account deletion prevents authority or snapshot resurrection", async () => {
    const outcomes = await Promise.allSettled([
      enroll(enrollInput()),
      db.runTransaction(async (tx) => {
        const profile = db.doc(`users/${uid}`);
        await Promise.all(
          [profile, db.doc(currentPath), db.doc(snapshotPath)].map((ref) =>
            tx.get(ref)
          )
        );
        tx.set(db.doc(`accountDeletionRequests/${uid}`), { status: "running" });
        tx.delete(profile);
        tx.delete(db.doc(currentPath));
        tx.delete(db.doc(snapshotPath));
      }),
    ]);
    expect(outcomes[1].status).toBe("fulfilled");
    expect((await db.doc(currentPath).get()).exists).toBe(false);
    expect((await db.doc(snapshotPath).get()).exists).toBe(false);
    await expect(enroll(enrollInput())).rejects.toMatchObject({
      details: { errorCode: "account-deleting" },
    });
  });
  it("disabled rollout never falls back to legacy after enrollment", async () => {
    await enroll(enrollInput());
    await db
      .doc("system/runningAuthority")
      .update({ enrollmentEnabled: false });
    expect(await negotiate(readInput())).toMatchObject({
      status: "unavailable",
      reason: "rollout_disabled",
    });
    expect((await db.doc(snapshotPath).get()).data()).toEqual(legacy);
  });
});

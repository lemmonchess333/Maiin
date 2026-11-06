/** Real local emulator only. Skipped results are not concurrency evidence. */
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { enrollRunningAuthority: enroll } = require("../../lib/runningEnrollment");
const { saveRunningReviewTransaction: review } = require("../../lib/runningReviewTransaction");
const { completeRunningMigrationTransaction: complete } = require("../../lib/runningMigrationTransaction");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !host) throw Error("Migration emulator required.");
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw Error("Local emulator required.");
(host ? describe : describe.skip)("migration real transactions", () => {
  let app, db;
  const uid = "migration-runner", now = Date.parse("2026-11-06T12:00:00Z");
  const input = () => ({ firestore: db, context: { auth: { uid } }, clock: () => now });
  const data = { expectedUid: uid, expectedRevision: 1, requestId: "migration1", raceGoalId: null, confirmed: true, acknowledgedLegacyPrescriptionsRetired: true };
  const reviewData = { expectedUid: uid, expectedRevision: 0, requestId: "review1", raceGoalId: null, confirmed: true,
    review: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 20 }, restrictions: { status: "none" } } };
  beforeAll(() => { app = admin.initializeApp({ projectId: "demo-running-migration" }, "running-migration"); db = app.firestore(); });
  afterAll(async () => { await app?.delete(); });
  beforeEach(async () => {
    await db.recursiveDelete(db.doc(`users/${uid}`)); await db.doc(`accountDeletionRequests/${uid}`).delete(); await db.doc(`deletedAccounts/${uid}`).delete();
    await db.doc("system/runningAuthority").set({ protocolVersion: 1, enrollmentEnabled: true, migrationEnabled: true });
    await db.doc(`users/${uid}`).set({ timezone: "UTC" });
    await enroll({ ...input(), data: { expectedUid: uid, supportedSchemaVersions: [1], confirmed: true } });
    await review({ ...input(), data: reviewData });
  });
  it("concurrent identical completion writes one transition and replays the rest", async () => {
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => complete({ ...input(), data })));
    expect(outcomes.filter(value => value.outcome === "completed")).toHaveLength(1);
    expect(outcomes.filter(value => value.outcome === "replayed")).toHaveLength(4);
    expect((await db.doc(`users/${uid}/runningState/current`).get()).data()).toMatchObject({ revision: 2, migration: { status: "complete" } });
  });
  it("competing review and completion cannot both commit their stale revision", async () => {
    const outcomes = await Promise.allSettled([complete({ ...input(), data }), review({ ...input(), data: { ...reviewData, requestId: "review2", expectedRevision: 1 } })]);
    expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect((await db.doc(`users/${uid}/runningState/current`).get()).data().revision).toBe(2);
  });
  it("deletion fence prevents completion and replay", async () => {
    await complete({ ...input(), data });
    await db.doc(`accountDeletionRequests/${uid}`).set({ status: "running" });
    await expect(complete({ ...input(), data })).rejects.toMatchObject({ details: { errorCode: "account-deleting" } });
  });
});

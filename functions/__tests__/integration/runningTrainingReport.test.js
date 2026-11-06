/** Actual Admin transactions only; no emulator means skipped, never live access. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const {
  submitOutsideTrainingReportTransaction: submit,
} = require("../../lib/runningTrainingReportTransaction");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !host)
  throw new Error(
    "FIRESTORE_EMULATOR_HOST required; report transactions did not run."
  );
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
  throw new Error("Local emulator required.");
const suite = host ? describe : describe.skip;
suite("outside-training report real transactions", () => {
  let app, firestore, input;
  const uid = "report-integration";
  const path = `users/${uid}/runningState/current`;
  beforeAll(() => {
    app = admin.initializeApp(
      { projectId: "demo-running-report-transactions" },
      "running-report-integration"
    );
    firestore = app.firestore();
  });
  afterAll(async () => {
    await app?.delete();
  });
  beforeEach(async () => {
    await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
    await firestore.doc(`accountDeletionRequests/${uid}`).delete();
    await firestore.doc(`deletedAccounts/${uid}`).delete();
    await firestore
      .doc(`users/${uid}`)
      .set({ displayName: "Synthetic report runner" });
    await firestore
      .doc(path)
      .set({
        schemaVersion: 1,
        accountId: uid,
        revision: 8,
        timeZone: "UTC",
        holds: [],
        constraints: {},
        history: [{ id: "past" }],
        plan: {
          raceGoalId: "race1",
          sessions: [
            {
              id: "session1",
              date: "2026-11-05",
              templateId: "run_walk_1",
              minutes: 29,
              kind: "run_walk",
            },
          ],
        },
      });
    input = {
      firestore,
      context: { auth: { uid } },
      clock: () => Date.parse("2026-11-06T12:00:00Z"),
      data: {
        expectedUid: uid,
        commandId: "report1",
        expectedAuthorityRevision: 8,
        raceGoalId: "race1",
        scheduledRunId: "session1",
        confirmationVersion: "outside-training-report-v1",
        report: {
          activityId: "outside:one",
          date: "2026-11-05",
          source: "outside_session",
          durationSeconds: 1800,
          relativeEffort: "matched",
          sessionCompletedAsDescribed: true,
          completedStage: 1,
          manageable: true,
        },
      },
    };
  });
  it("parallel identical submissions commit once and replay the same report", async () => {
    const results = await Promise.all([submit(input), submit(input)]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "replayed",
      "saved",
    ]);
    expect((await firestore.doc(path).get()).data().revision).toBe(9);
    expect(
      (await firestore.collection(`users/${uid}/runningTrainingReports`).get())
        .size
    ).toBe(1);
    expect(results[0].receipt.report).toEqual(results[1].receipt.report);
  });
  it("competing reports with the same expected revision cannot both commit", async () => {
    const other = {
      ...input,
      data: {
        ...input.data,
        commandId: "report2",
        report: { ...input.data.report, activityId: "outside:two" },
      },
    };
    const results = await Promise.allSettled([submit(input), submit(other)]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect((await firestore.doc(path).get()).data().revision).toBe(9);
    expect(
      (await firestore.collection(`users/${uid}/runningTrainingReports`).get())
        .size
    ).toBe(1);
  });
  it("a concurrent hold is preserved and makes a stale report retry fail", async () => {
    const report = submit(input).then(
      (result) => ({ saved: true, result }),
      () => ({ saved: false })
    );
    await firestore.runTransaction(async (tx) => {
      const ref = firestore.doc(path);
      const state = (await tx.get(ref)).data();
      tx.update(ref, { revision: state.revision + 1, holds: ["injury"] });
    });
    const outcome = await report;
    const state = (await firestore.doc(path).get()).data();
    expect(state.holds).toEqual(["injury"]);
    expect(state.history).toEqual([{ id: "past" }]);
    expect(state.revision).toBe(outcome.saved ? 10 : 9);
  });
  it("deletion blocks even an otherwise valid durable replay", async () => {
    await submit(input);
    await firestore
      .doc(`accountDeletionRequests/${uid}`)
      .set({ status: "running" });
    await expect(submit(input)).rejects.toMatchObject({
      details: { errorCode: "account-deleting" },
    });
    expect((await firestore.doc(path).get()).data().revision).toBe(9);
  });
});

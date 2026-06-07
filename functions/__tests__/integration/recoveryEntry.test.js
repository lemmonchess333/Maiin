/**
 * Integration tests for the recovery-entry side-effect wrapper
 * (`_maybeWriteRecoveryEntryForRun`) against the Firestore emulator.
 *
 * Pins the MEDIUM functions finding: onRunCreated's recovery-entry
 * path previously did a non-transactional read → whole-runPlan
 * spread → set(merge) on programState.runPlan. Two races followed:
 *   (a) double-append of completedRaces on duplicate / concurrent
 *       trigger deliveries (the Gate-6 includes() check read the
 *       pre-write snapshot);
 *   (b) the whole-runPlan merge clobbered concurrent runPlan edits
 *       (sweep L3 / client) that landed between read and write.
 *
 * The fix wraps read-check-write in db.runTransaction (re-reading
 * programState + profile on the fresh snapshot, re-running the
 * decision, writing ONLY phase/recoveryEndDate/completedRaces via a
 * field-level recursive merge).
 *
 * The pure decision (`_decideRecoveryEntry`) is unit-tested in
 * ../recoveryEntry.test.js — this file exercises the PERSISTENCE.
 *
 * Gated on FIRESTORE_EMULATOR_HOST so `npm test` from `functions/`
 * still passes when run outside the emulator (matches the pattern
 * used by ./rateLimiter.test.js + ./configurePlan.test.js).
 *
 * To run locally:
 *   firebase emulators:start --only firestore
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     GCLOUD_PROJECT=demo-tropos \
 *     npm test --prefix functions
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let _maybeWriteRecoveryEntryForRun;

const RACE_DATE = "2026-05-15";
const RACE_DAY_ID = "runday_race_2026-05-15";
// 10K → 2 weeks recovery, anchored on race date 2026-05-15.
const EXPECTED_RECOVERY_END = "2026-05-29";

const UID = "u-recovery-entry-1";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-tropos",
    });
  }
  db = admin.firestore();
  ({ _maybeWriteRecoveryEntryForRun } = require("../../index"));
});

function userRef() {
  return db.collection("users").doc(UID);
}
function programRef() {
  return userRef().collection("programState").doc("current");
}

function savedRun(overrides = {}) {
  return {
    id: "saved-race",
    date: RACE_DATE,
    actualTemplateId: "race",
    distance: 10000,
    avgPace: 280,
    ...overrides,
  };
}

async function seed(runPlanExtra = {}) {
  await userRef().set({
    uid: UID,
    runMode: "race_prep",
    raceGoal: { distance: "10k", targetDate: RACE_DATE },
  });
  await programRef().set({
    runDays: [
      {
        id: RACE_DAY_ID,
        dayIndex: 6,
        templateId: "race",
        type: "race",
        status: "planned",
        date: RACE_DATE,
      },
    ],
    runPlan: {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: RACE_DATE },
      ...runPlanExtra,
    },
  });
}

async function readRunPlan() {
  const snap = await programRef().get();
  return (snap.data() || {}).runPlan || {};
}

async function clearUser() {
  // Delete the programState subcollection doc + the user doc.
  await programRef()
    .delete()
    .catch(() => {});
  await userRef()
    .delete()
    .catch(() => {});
}

suite("_maybeWriteRecoveryEntryForRun — emulator integration", () => {
  beforeEach(async () => {
    await clearUser();
  });

  it("writes recovery phase + endDate + completedRaces on first delivery", async () => {
    await seed();
    await _maybeWriteRecoveryEntryForRun(UID, savedRun());

    const runPlan = await readRunPlan();
    expect(runPlan.phase).toBe("recovery");
    expect(runPlan.recoveryEndDate).toBe(EXPECTED_RECOVERY_END);
    expect(runPlan.completedRaces).toEqual([RACE_DAY_ID]);
  });

  it("does NOT double-append completedRaces on duplicate delivery (idempotent)", async () => {
    await seed();
    // Two deliveries of the same trigger. Pre-fix, both read the
    // pre-write snapshot and the includes() check passed twice,
    // double-appending RACE_DAY_ID.
    await _maybeWriteRecoveryEntryForRun(UID, savedRun());
    await _maybeWriteRecoveryEntryForRun(UID, savedRun());

    const runPlan = await readRunPlan();
    expect(runPlan.completedRaces).toEqual([RACE_DAY_ID]);
  });

  it("does NOT double-append under CONCURRENT deliveries", async () => {
    await seed();
    // Fire both in parallel. The transaction's optimistic-concurrency
    // retry serialises them; the loser re-reads the committed
    // completedRaces (now containing RACE_DAY_ID) and Gate-6 no-ops.
    await Promise.all([
      _maybeWriteRecoveryEntryForRun(UID, savedRun()),
      _maybeWriteRecoveryEntryForRun(UID, savedRun()),
    ]);

    const runPlan = await readRunPlan();
    expect(runPlan.completedRaces).toEqual([RACE_DAY_ID]);
  });

  it("appends to an existing completedRaces array (multi-race)", async () => {
    await seed({ completedRaces: ["older_race_id_x"] });
    await _maybeWriteRecoveryEntryForRun(UID, savedRun());

    const runPlan = await readRunPlan();
    expect(runPlan.completedRaces).toEqual(["older_race_id_x", RACE_DAY_ID]);
  });

  it("does a FIELD-LEVEL merge — preserves other runPlan fields (no whole-map clobber)", async () => {
    // totalWeeks / currentWeek / raceGoal must survive the write.
    // Pre-fix the whole-runPlan spread carried them through; the
    // field-level merge must too (and must not clobber a field the
    // decision didn't compute).
    await seed({ totalWeeks: 8, currentWeek: 8, mode: "race_prep" });
    await _maybeWriteRecoveryEntryForRun(UID, savedRun());

    const runPlan = await readRunPlan();
    expect(runPlan.phase).toBe("recovery");
    expect(runPlan.totalWeeks).toBe(8);
    expect(runPlan.currentWeek).toBe(8);
    expect(runPlan.mode).toBe("race_prep");
    expect(runPlan.raceGoal).toEqual({
      distance: "10k",
      targetDate: RACE_DATE,
    });
  });

  it("does NOT clobber a concurrent runPlan edit to an unrelated field", async () => {
    // Simulate the sweep / client writing an unrelated runPlan field
    // AFTER the recovery-entry seed but persisted before our write.
    // The field-level merge must leave it intact (the whole-map
    // spread would have dropped it because the decision built its
    // payload from a stale snapshot).
    await seed({ totalWeeks: 8 });
    await programRef().set(
      { runPlan: { lastSweepNote: "touched-by-sweep" } },
      { merge: true }
    );
    await _maybeWriteRecoveryEntryForRun(UID, savedRun());

    const runPlan = await readRunPlan();
    expect(runPlan.phase).toBe("recovery");
    expect(runPlan.lastSweepNote).toBe("touched-by-sweep");
    expect(runPlan.totalWeeks).toBe(8);
  });

  it("no-ops when the user has no programState doc", async () => {
    // No seed — both docs absent. Should swallow gracefully (txn
    // early-returns) and not throw.
    await expect(
      _maybeWriteRecoveryEntryForRun(UID, savedRun())
    ).resolves.toBeUndefined();
  });
});

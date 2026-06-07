/**
 * Integration tests for the daily race-reconciliation PERSISTENCE wrapper
 * (`_runDailyRaceReconciliationForUser`) against the Firestore emulator.
 *
 * The pure decision (`_decideReconciliationActions`) is exhaustively
 * unit-tested in ../dailyRaceReconciliationSweep.test.js. That suite's
 * header says the Firestore-backed wrapper "is emulator-tested
 * separately" — but until now it wasn't: the wrapper was exported and
 * referenced only in that comment. This file closes that gap.
 *
 * What's uniquely covered here (not by the pure decision tests):
 *   - The Run9 3b DUAL-DOC write — L3 recovery-exit must materialize
 *     `runMode: "freeform"` + `raceGoal: null` onto the PROFILE doc AND
 *     null `phase`/`recoveryEndDate`/`raceGoal` on programState.runPlan,
 *     in the same sweep. (QA backlog #901 / #815 flagged this exact
 *     materialization as "code in place, behaviour unverified".)
 *   - The set(merge) field-level behaviour preserves unrelated runPlan
 *     fields (totalWeeks) through the write.
 *   - The newer-future-race case writes the runPlan but NO profile clear
 *     (profilePayload null) — the successor race survives a real write.
 *   - L1 race_no_show status flips on the persisted runDay.
 *   - Idempotency against the post-write state (second sweep no-ops).
 *
 * Gated on FIRESTORE_EMULATOR_HOST so `npm test` from `functions/` still
 * passes outside the emulator (matches ./recoveryEntry.test.js).
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
let _runDailyRaceReconciliationForUser;
let _recoveryEndDateForRace;
let _utcDateString;

const UID = "u-race-reconcile-1";
const DAY_MS = 24 * 60 * 60 * 1000;

// Dates anchored to the REAL clock — the wrapper reads Date.now()
// internally (no injection seam), so seeds must sit safely in the
// past/future relative to whenever the suite runs.
function daysAgo(n) {
  return _utcDateString(new Date(Date.now() - n * DAY_MS));
}
function daysAhead(n) {
  return _utcDateString(new Date(Date.now() + n * DAY_MS));
}

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-tropos",
    });
  }
  db = admin.firestore();
  ({
    _runDailyRaceReconciliationForUser,
    _recoveryEndDateForRace,
    _utcDateString,
  } = require("../../index"));
});

function userRef() {
  return db.collection("users").doc(UID);
}
function programRef() {
  return userRef().collection("programState").doc("current");
}

async function seed({ profile, programState }) {
  await userRef().set({ uid: UID, ...profile });
  await programRef().set(programState);
  // Read-back guard. Under the 10-/20-way parallel emulator contention this
  // suite runs in (see vitest.config.js), a read can transiently lag the
  // just-written doc. The reconciliation wrapper reads via
  // readUserProgramContext, which returns null when programState/current isn't
  // yet visible — that silently skips the L1/L3 passes and surfaced as a flaky
  // `noShowWritten: false` (CI 2026-06-07). Confirm both docs are readable
  // before any test invokes the wrapper so the function never races the seed.
  for (let i = 0; i < 40; i++) {
    const [u, p] = await Promise.all([userRef().get(), programRef().get()]);
    if (u.exists && p.exists) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("seed read-back never became visible (emulator contention)");
}

async function readProfile() {
  return (await userRef().get()).data() || {};
}
async function readRunPlan() {
  return ((await programRef().get()).data() || {}).runPlan || {};
}
async function readRunDays() {
  return ((await programRef().get()).data() || {}).runDays || [];
}

async function clearUser() {
  await programRef()
    .delete()
    .catch(() => {});
  await userRef()
    .delete()
    .catch(() => {});
}

suite("_runDailyRaceReconciliationForUser — emulator integration", () => {
  beforeEach(async () => {
    await clearUser();
  });

  it("L3 recovery-exit: materializes runMode=freeform + raceGoal=null on BOTH docs", async () => {
    // Completed 10k race 40d ago → recovery ended ~26d ago, well past the
    // +7d grace. The current goal IS the completed race → full freeform exit.
    const raceGoal = { distance: "10k", targetDate: daysAgo(40) };
    const recoveryEndDate = _recoveryEndDateForRace(raceGoal);
    await seed({
      profile: { runMode: "race_prep", raceGoal },
      programState: {
        runDays: [],
        runPlan: {
          mode: "race_prep",
          raceGoal,
          phase: "recovery",
          recoveryEndDate,
          totalWeeks: 8,
          currentWeek: 8,
        },
      },
    });

    const result = await _runDailyRaceReconciliationForUser(UID);
    expect(result.recoveryCleared).toBe(true);

    // Profile doc materialized.
    const profile = await readProfile();
    expect(profile.runMode).toBe("freeform");
    expect(profile.raceGoal).toBeNull();

    // programState doc nulled — and unrelated fields preserved (field-level merge).
    const runPlan = await readRunPlan();
    expect(runPlan.phase).toBeNull();
    expect(runPlan.recoveryEndDate).toBeNull();
    expect(runPlan.raceGoal).toBeNull();
    expect(runPlan.totalWeeks).toBe(8);
  });

  it("recovery-exit with a NEWER future race: writes runPlan but NOT the profile clear", async () => {
    // recoveryEndDate anchored to an OLD completed race; the user's current
    // goal is a newer future race → exit recovery but KEEP race_prep, and
    // never delete the successor.
    const oldRace = { distance: "10k", targetDate: daysAgo(40) };
    const recoveryEndDate = _recoveryEndDateForRace(oldRace);
    const newRace = { distance: "half", targetDate: daysAhead(40) };
    await seed({
      profile: { runMode: "race_prep", raceGoal: newRace },
      programState: {
        runDays: [],
        runPlan: {
          mode: "race_prep",
          raceGoal: newRace,
          phase: "recovery",
          recoveryEndDate,
        },
      },
    });

    const result = await _runDailyRaceReconciliationForUser(UID);
    expect(result.recoveryCleared).toBe(true);

    // Profile untouched — still race_prep with the successor race.
    const profile = await readProfile();
    expect(profile.runMode).toBe("race_prep");
    expect(profile.raceGoal).toEqual(newRace);

    // runPlan exits recovery but the newer race survives.
    const runPlan = await readRunPlan();
    expect(runPlan.phase).toBeNull();
    expect(runPlan.raceGoal).toEqual(newRace);
  });

  it("L1 race_no_show: flips the planned race-day status on the persisted runDay", async () => {
    // Race 10d ago (past the 3d grace), slot still 'planned', no saved
    // race-templated run on that date → no-show.
    const raceDate = daysAgo(10);
    const raceGoal = { distance: "10k", targetDate: raceDate };
    await seed({
      profile: { runMode: "race_prep", raceGoal },
      programState: {
        runDays: [
          {
            id: "runday_race_x",
            dayIndex: 6,
            templateId: "race",
            type: "race",
            status: "planned",
            date: raceDate,
          },
        ],
        runPlan: { mode: "race_prep", raceGoal },
      },
    });

    const result = await _runDailyRaceReconciliationForUser(UID);
    expect(result.noShowWritten).toBe(true);

    const runDays = await readRunDays();
    expect(runDays[0].status).toBe("race_no_show");
  });

  it("is idempotent — a second sweep over the post-write state writes nothing", async () => {
    const raceGoal = { distance: "marathon", targetDate: daysAgo(60) };
    const recoveryEndDate = _recoveryEndDateForRace(raceGoal);
    await seed({
      profile: { runMode: "race_prep", raceGoal },
      programState: {
        runDays: [],
        runPlan: {
          mode: "race_prep",
          raceGoal,
          phase: "recovery",
          recoveryEndDate,
        },
      },
    });

    const first = await _runDailyRaceReconciliationForUser(UID);
    expect(first.recoveryCleared).toBe(true);

    // Second pass: state is now freeform / phase null → decision no-ops.
    const second = await _runDailyRaceReconciliationForUser(UID);
    expect(second.recoveryCleared).toBe(false);

    const profile = await readProfile();
    expect(profile.runMode).toBe("freeform");
    expect(profile.raceGoal).toBeNull();
  });

  it("no-ops cleanly for a freeform user (no writes, no throw)", async () => {
    await seed({
      profile: { runMode: "freeform" },
      programState: { runDays: [], runPlan: { mode: "freeform" } },
    });

    const result = await _runDailyRaceReconciliationForUser(UID);
    expect(result.recoveryCleared).toBe(false);
    expect(result.noShowWritten).toBe(false);

    const profile = await readProfile();
    expect(profile.runMode).toBe("freeform");
  });
});

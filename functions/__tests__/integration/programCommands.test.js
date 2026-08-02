/**
 * Integration tests for the programState command transaction (packet 18)
 * against the Firestore emulator. Exercises the real read-modify-write path
 * (runProgramCommandTransaction): idempotency receipts, the two-command
 * survival guarantee, the completeWorkoutDay workout effect, and the
 * in-transaction deletion / tombstone gate.
 *
 * Gated on FIRESTORE_EMULATOR_HOST; skips otherwise.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const programCommands = require("../../lib/programCommands");
const {
  runProgramCommandTransaction,
} = require("../../lib/programCommandTransaction");

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

const UID = "uid-progcmd-int";
const NOW = Date.parse("2026-07-13T12:00:00Z");

let db;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-tropos",
    });
  }
  db = admin.firestore();
});

function programRef() {
  return db
    .collection("users")
    .doc(UID)
    .collection("programState")
    .doc("current");
}

function seedState() {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 5,
    splitType: "upper_lower",
    fatigueScore: 0,
    updatedAt: 1000,
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    workouts: [
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        skipped: false,
        exercises: [
          {
            name: "Bench",
            exerciseId: "bench-press",
            instanceId: "inst-a",
            movementCategory: "horizontal_push",
            sets: 3,
            reps: 8,
            weight: 100,
          },
          {
            name: "Row",
            exerciseId: "cable-row",
            instanceId: "inst-b",
            movementCategory: "horizontal_pull",
            sets: 3,
            reps: 10,
            weight: 60,
          },
        ],
      },
      {
        dayName: "Legs",
        dayType: "legs",
        completed: false,
        skipped: false,
        exercises: [
          {
            name: "Squat",
            exerciseId: "front-squat",
            instanceId: "inst-c",
            movementCategory: "knee_dominant",
            sets: 3,
            reps: 5,
            weight: 140,
          },
        ],
      },
    ],
    runDays: [
      {
        id: "run-1",
        dayIndex: 2,
        templateId: "easy_30",
        type: "easy",
        status: "planned",
        completed: false,
      },
    ],
    manualCompletions: {},
  };
}

async function reset(seedProgram = true) {
  await db.recursiveDelete(db.collection("users").doc(UID));
  await db
    .collection("accountDeletionRequests")
    .doc(UID)
    .delete()
    .catch(() => {});
  await db
    .collection("deletedAccounts")
    .doc(UID)
    .delete()
    .catch(() => {});
  if (seedProgram) {
    await programRef().set(seedState());
    await db
      .collection("users")
      .doc(UID)
      .set({ weightKg: 80, timezone: "UTC" });
  }
}

function validate(cmd) {
  return programCommands.assertClientProgramCommand(cmd);
}

const skipPush = () =>
  validate({
    kind: "skipWorkoutDay",
    commandId: "cmd_int_skip_push_0001",
    dayIndex: 0,
    expectedWeekNumber: 5,
    expectedDaySignature: "Push|inst-a|inst-b",
  });

suite("runProgramCommandTransaction — apply + receipt", () => {
  beforeEach(() => reset());

  it("applies a command, writes state + a receipt, duplicate:false", async () => {
    const res = await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: skipPush(),
      now: NOW,
    });
    expect(res.duplicate).toBe(false);
    expect(res.committedUpdatedAt).toBe(NOW);

    const state = (await programRef().get()).data();
    expect(state.workouts[0].skipped).toBe(true);
    expect(state.updatedAt).toBe(NOW);

    const receipt = await programRef()
      .collection("commandReceipts")
      .doc("cmd_int_skip_push_0001")
      .get();
    expect(receipt.exists).toBe(true);
    expect(receipt.data().kind).toBe("skipWorkoutDay");
  });

  it("is idempotent: replaying the same commandId is a no-op", async () => {
    await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: skipPush(),
      now: NOW,
    });
    // Corrupt state under the same id to prove the replay does NOT re-apply.
    await programRef().update({ fatigueScore: 42 });
    const res = await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: skipPush(),
      now: NOW + 5000,
    });
    expect(res.duplicate).toBe(true);
    const state = (await programRef().get()).data();
    expect(state.fatigueScore).toBe(42); // untouched by the replay
  });

  it("two different commands both survive (no last-write-wins clobber)", async () => {
    await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: validate({
        kind: "transitionRunDay",
        commandId: "cmd_int_run_skip_0001",
        runDayId: "run-1",
        to: "skipped",
      }),
      now: NOW,
    });
    await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: skipPush(),
      now: NOW + 1000,
    });
    const state = (await programRef().get()).data();
    expect(state.runDays[0].status).toBe("skipped");
    expect(state.workouts[0].skipped).toBe(true);
  });

  it("skipRecoveryEarly commits the profile patch and the plan change TOGETHER", async () => {
    // The reason this writer moved to the boundary. As two client writes
    // (Promise.all([updateProfile, saveProgram])) either could land alone,
    // leaving profile.runMode disagreeing with runPlan.phase. One transaction
    // is the only thing that actually rules that out — the reducer unit tests
    // can only prove the two VALUES are consistent, not that both land.
    const race = { distance: "marathon", targetDate: "2026-03-15" };
    await programRef().update({
      runPlan: {
        mode: "race_prep",
        phase: "recovery",
        recoveryEndDate: "2026-04-01",
        raceGoal: race,
      },
    });
    await db
      .collection("users")
      .doc(UID)
      .set({
        weightKg: 80,
        timezone: "UTC",
        runMode: "race_prep",
        raceGoal: race,
      });

    await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: validate({
        kind: "skipRecoveryEarly",
        commandId: "cmd_int_skiprecov_0001",
      }),
      now: NOW,
    });

    const state = (await programRef().get()).data();
    expect(state.runPlan).toBeUndefined();
    expect(state.runDays).toEqual([]);

    const profile = (await db.collection("users").doc(UID).get()).data();
    expect(profile.runMode).toBe("freeform");
    // `raceGoal: null` must actually reach the document. The profile
    // sanitizer DROPS null (cleanObject returns undefined), which is exactly
    // why this effect bypasses it — and why asserting the reducer's return
    // value alone would not have caught a sanitized write path.
    expect(profile.raceGoal).toBeNull();
    // Untouched fields survive the merge.
    expect(profile.weightKg).toBe(80);
  });

  it("skipRecoveryEarly keeps a successor race and stays race_prep", async () => {
    const older = { distance: "marathon", targetDate: "2026-03-15" };
    const newer = { distance: "10k", targetDate: "2026-09-01" };
    await programRef().update({
      runPlan: {
        mode: "race_prep",
        phase: "recovery",
        recoveryEndDate: "2026-04-01",
        raceGoal: older,
      },
    });
    await db
      .collection("users")
      .doc(UID)
      .set({ weightKg: 80, runMode: "race_prep", raceGoal: newer });

    await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: validate({
        kind: "skipRecoveryEarly",
        commandId: "cmd_int_skiprecov_0002",
      }),
      now: NOW,
    });

    const profile = (await db.collection("users").doc(UID).get()).data();
    expect(profile.runMode).toBe("race_prep");
    expect(profile.raceGoal).toEqual(newer);
    const state = (await programRef().get()).data();
    expect(state.runPlan.mode).toBe("race_prep");
    expect(state.runPlan.phase).toBeUndefined();
  });

  it("completeWorkoutDay writes the programme workout doc with createdAt", async () => {
    await runProgramCommandTransaction({
      firestore: db,
      uid: UID,
      command: validate({
        kind: "completeWorkoutDay",
        commandId: "cmd_int_complete_0001",
        dayIndex: 0,
        expectedWeekNumber: 5,
        expectedDaySignature: "Push|inst-a|inst-b",
        completion: {
          completionId: "sess_int_0001",
          durationMinutes: 45,
          setLogs: [[{ weight: 100, reps: 8, completed: true }], []],
        },
      }),
      now: NOW,
    });
    const state = (await programRef().get()).data();
    expect(state.workouts[0].completed).toBe(true);

    const workout = await db
      .collection("users")
      .doc(UID)
      .collection("workouts")
      .doc("programme-sess_int_0001")
      .get();
    expect(workout.exists).toBe(true);
    expect(workout.data().source).toBe("programme");
    expect(workout.data().createdAt).toBeTruthy(); // Timestamp injected
    expect(workout.data().totalCalories).toBeGreaterThan(0);
  });
});

suite("runProgramCommandTransaction — deletion gates + preconditions", () => {
  beforeEach(() => reset());

  it("rejects when an account deletion is active; no state/receipt write", async () => {
    await db
      .collection("accountDeletionRequests")
      .doc(UID)
      .set({ status: "running" });
    await expect(
      runProgramCommandTransaction({
        firestore: db,
        uid: UID,
        command: skipPush(),
        now: NOW,
      })
    ).rejects.toThrow();
    const state = (await programRef().get()).data();
    expect(state.workouts[0].skipped).toBe(false); // unchanged
    const receipt = await programRef()
      .collection("commandReceipts")
      .doc("cmd_int_skip_push_0001")
      .get();
    expect(receipt.exists).toBe(false);
  });

  it("rejects when a live tombstone exists; no write", async () => {
    await db.collection("deletedAccounts").doc(UID).set({ uid: UID }); // no expiresAt = live
    await expect(
      runProgramCommandTransaction({
        firestore: db,
        uid: UID,
        command: skipPush(),
        now: NOW,
      })
    ).rejects.toThrow();
    const receipt = await programRef()
      .collection("commandReceipts")
      .doc("cmd_int_skip_push_0001")
      .get();
    expect(receipt.exists).toBe(false);
  });

  it("rejects failed-precondition when the programState doc is absent", async () => {
    await reset(false); // no programState seeded
    await expect(
      runProgramCommandTransaction({
        firestore: db,
        uid: UID,
        command: skipPush(),
        now: NOW,
      })
    ).rejects.toThrow(/not ready/i);
  });

  it("rejects a stale day signature; no write", async () => {
    await expect(
      runProgramCommandTransaction({
        firestore: db,
        uid: UID,
        command: validate({
          kind: "skipWorkoutDay",
          commandId: "cmd_int_stale_0001",
          dayIndex: 0,
          expectedWeekNumber: 5,
          expectedDaySignature: "Push|inst-a", // wrong (missing inst-b)
        }),
        now: NOW,
      })
    ).rejects.toThrow();
    const state = (await programRef().get()).data();
    expect(state.workouts[0].skipped).toBe(false);
  });
});

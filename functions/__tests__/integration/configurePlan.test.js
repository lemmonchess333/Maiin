/**
 * Integration tests for the configurePlan + completeOnboarding
 * callables against the Firestore emulator. Pins the spec v7
 * Cloud-Function required-tests gates:
 *
 *   - completeOnboarding rejects malformed payload (invalid status)
 *   - completeOnboarding writes profile + programState atomically
 *   - configurePlan rejects payload missing schema versions
 *
 * (The unauthenticated rejection path is unit-tested in
 *  ../planWriteCallables.test.js — that runs without an emulator.)
 *
 * Gated on FIRESTORE_EMULATOR_HOST so `npm test` from `functions/`
 * still passes when run outside the emulator (matches the pattern
 * used by ../integration/rateLimiter.test.js).
 *
 * To run locally:
 *   firebase emulators:start --only firestore
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     GCLOUD_PROJECT=demo-tropos \
 *     npm test --prefix functions
 *
 * CI runs this via the emulator-tests workflow.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let admin;
let configurePlan;
let completeOnboarding;
let db;

const TEST_UID = "u-cfgplan-1";

function validWeekSchedule() {
  return [
    { day: 0, type: "rest" },
    { day: 1, type: "lift" },
    { day: 2, type: "run" },
    { day: 3, type: "lift" },
    { day: 4, type: "run" },
    { day: 5, type: "rest" },
    { day: 6, type: "lift" },
  ];
}

function validProgramState(overrides = {}) {
  return {
    programSchemaVersion: 2,
    goal: "recomp",
    currentPhase: "Hypertrophy",
    weekNumber: 1,
    splitType: "full_body",
    workouts: [],
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    runDays: [
      {
        id: "runday_2026-05-10_2_easy_30",
        date: "2026-05-12",
        weekKey: "2026-05-10",
        templateId: "easy_30",
        status: "planned",
      },
    ],
    runPlan: { mode: "structured" },
    ...overrides,
  };
}

function validProfileUpdates(overrides = {}) {
  return {
    weekSchedule: validWeekSchedule(),
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 3,
    weeklyRunDaysTarget: 2,
    weeklyRunsTarget: 2,
    runMode: "structured",
    primaryGoal: "hypertrophy",
    ...overrides,
  };
}

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  // Require index BEFORE touching admin.initializeApp() ourselves.
  // index.js calls admin.initializeApp() at module load (line 5);
  // doing our own init first would trigger a double-init error
  // ("The default Firebase app already exists") because the second
  // call inside index.js doesn't pass an app name. Once index has
  // loaded, admin.apps.length > 0 so any later guarded re-init
  // we attempt is a no-op.
  const idx = require("../../index");
  configurePlan = idx.configurePlan;
  completeOnboarding = idx.completeOnboarding;
  admin = require("firebase-admin");
  db = admin.firestore();
});

// Firestore emulator under CI load occasionally returns
// batch.commit() success a few milliseconds before the
// just-written doc is visible to a fresh .get() from the same
// client. Diagnosed via [DEBUG-cfg] logs on CI run 26028363406:
// every projectId / path / writeResultCount matched, the only
// variable was timing (~30ms between commit success and first
// successful read on the run where logs were present, < that on
// the run where they weren't). Production Firestore is strongly
// consistent — this defensive poll only matters against the
// emulator. Three attempts at 50ms intervals = 150ms ceiling, which
// is still under the 30s vitest timeout by a large margin.
// Defensive read with retry. The Firestore emulator occasionally
// has a commit→read race where a doc just written via batch.commit()
// isn't yet visible to a subsequent .get() against the same ref.
// (See c7016e9 for the full diagnosis — Heisenbug only against
// the emulator, production is strongly consistent.)
//
// 10 attempts × 100ms = 1000ms ceiling. Original budget was
// 3 × 50ms = 150ms; that was enough until the auto-merge wave (PR
// #698-era) ran multiple PR CI jobs in parallel and the
// emulator-under-load latency exceeded 150ms. 1000ms is still well
// under the 30s vitest timeout.
async function getDocSettled(ref, attempts = 10) {
  for (let i = 0; i < attempts - 1; i++) {
    const doc = await ref.get();
    if (doc.exists) return doc;
    await new Promise((r) => setTimeout(r, 100));
  }
  return ref.get();
}

async function clearTestUserState() {
  // Wipe rate-limit entries for both callables so each test starts
  // unthrottled. configurePlan + onboarding use distinct action
  // keys, but clearing both is cheap and avoids cross-test bleed.
  await db
    .collection("rateLimits")
    .doc(`${TEST_UID}_configurePlan`)
    .delete()
    .catch(() => {});
  await db
    .collection("rateLimits")
    .doc(`${TEST_UID}_onboarding`)
    .delete()
    .catch(() => {});
  // Wipe user + programState so atomic-write assertions can
  // observe a fresh write.
  const userRef = db.collection("users").doc(TEST_UID);
  await userRef
    .collection("programState")
    .doc("current")
    .delete()
    .catch(() => {});
  await userRef.delete().catch(() => {});
  // Clear any deletion ledger / tombstone the freeze tests seed.
  await db
    .collection("accountDeletionRequests")
    .doc(TEST_UID)
    .delete()
    .catch(() => {});
  await db
    .collection("deletedAccounts")
    .doc(TEST_UID)
    .delete()
    .catch(() => {});
}

// Seed a COMPLETED deletion (non-active status) + a live tombstone, i.e.
// the post-deletion window the tombstone-freeze packet closes.
async function seedCompletedDeletionTombstone(uid) {
  await db.collection("accountDeletionRequests").doc(uid).set({
    uid,
    status: "completed",
    operationId: "op-completed",
  });
  await db
    .collection("deletedAccounts")
    .doc(uid)
    .set({
      uid,
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    });
}

suite("configurePlan — emulator integration", () => {
  beforeEach(async () => {
    await clearTestUserState();
  });

  it("stores recurring availability with its plan and clears it explicitly", async () => {
    const user = db.collection("users").doc(TEST_UID);
    await user.set({ ...validProfileUpdates(), runTimeLimits: { sessionMinutes: 90, longRunMinutes: 120 } });
    const programState = validProgramState();
    programState.runDays = [{ id: "time-fit", dayIndex: 0, date: "2026-09-13", weekKey: "2026-09-07", templateId: "long_8k", type: "long", status: "planned", timeLimit: { minutes: 45, originalTemplateId: "long_12k" } }];
    const limits = { sessionMinutes: 30, longRunMinutes: 45 };
    await configurePlan.run({ profileUpdates: { ...validProfileUpdates(), runTimeLimits: limits }, programState, weekSchedule: validWeekSchedule() }, { auth: { uid: TEST_UID } });
    expect((await user.get()).data().runTimeLimits).toEqual(limits);
    expect((await user.collection("programState").doc("current").get()).data().runDays[0].timeLimit).toEqual({ minutes: 45, originalTemplateId: "long_12k" });
    await db.collection("rateLimits").doc(`${TEST_UID}_configurePlan`).delete();
    await configurePlan.run({ profileUpdates: { ...validProfileUpdates(), runTimeLimits: null }, programState, weekSchedule: validWeekSchedule() }, { auth: { uid: TEST_UID } });
    expect((await user.get()).data().runTimeLimits).toBeNull();
  });

  it("rejects payload missing programSchemaVersion (invalid-argument)", async () => {
    const ps = validProgramState();
    delete ps.programSchemaVersion;
    await expect(
      configurePlan.run(
        {
          profileUpdates: validProfileUpdates(),
          programState: ps,
          weekSchedule: validWeekSchedule(),
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects payload missing weekScheduleVersion (invalid-argument)", async () => {
    const upd = validProfileUpdates();
    delete upd.weekScheduleVersion;
    await expect(
      configurePlan.run(
        {
          profileUpdates: upd,
          programState: validProgramState(),
          weekSchedule: validWeekSchedule(),
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects payload missing profileUpdates entirely (invalid-argument)", async () => {
    await expect(
      configurePlan.run(
        {
          programState: validProgramState(),
          weekSchedule: validWeekSchedule(),
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects a tombstoned account with account-deleted and writes NOTHING", async () => {
    await seedCompletedDeletionTombstone(TEST_UID);
    await expect(
      configurePlan.run(
        {
          profileUpdates: validProfileUpdates(),
          programState: validProgramState(),
          weekSchedule: validWeekSchedule(),
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { errorCode: "account-deleted", uid: TEST_UID },
    });
    // The guard runs before the rate-limit write AND before the Admin
    // batch — no rate-limit, user, or programState doc should exist.
    const rl = await db
      .collection("rateLimits")
      .doc(`${TEST_UID}_configurePlan`)
      .get();
    expect(rl.exists).toBe(false);
    const userDoc = await db.collection("users").doc(TEST_UID).get();
    expect(userDoc.exists).toBe(false);
    const psDoc = await db
      .collection("users")
      .doc(TEST_UID)
      .collection("programState")
      .doc("current")
      .get();
    expect(psDoc.exists).toBe(false);
  });

  it("rejects an actively-deleting account with account-deleting", async () => {
    await db.collection("accountDeletionRequests").doc(TEST_UID).set({
      uid: TEST_UID,
      status: "running",
      operationId: "op-running",
    });
    await expect(
      configurePlan.run(
        {
          profileUpdates: validProfileUpdates(),
          programState: validProgramState(),
          weekSchedule: validWeekSchedule(),
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { errorCode: "account-deleting", uid: TEST_UID },
    });
  });
});

suite("completeOnboarding — emulator integration", () => {
  beforeEach(async () => {
    await clearTestUserState();
  });

  it("rejects malformed payload — runDay with invalid status (invalid-argument)", async () => {
    const ps = validProgramState();
    // "moved" is intentionally NOT a valid status per the spec —
    // moves live in metadata (movedFromDate/movedToDate).
    ps.runDays = [{ ...ps.runDays[0], status: "moved" }];
    await expect(
      completeOnboarding.run(
        {
          profileData: {
            ...validProfileUpdates(),
            weightKg: 70,
            heightCm: 175,
            age: 30,
            sex: "male",
            activityLevel: "moderate",
          },
          programState: ps,
          weekSchedule: validWeekSchedule(),
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("writes profile + programState atomically on valid payload", async () => {
    // Spec gate: completeOnboarding must commit profile +
    // programState together. We assert both documents exist
    // after a single successful call, with the fields we sent
    // visible. The CF uses a Firestore batch internally; an
    // uncommitted second write would leave programState absent.
    const result = await completeOnboarding.run(
      {
        profileData: {
          ...validProfileUpdates(),
          weightKg: 72,
          heightCm: 180,
          age: 28,
          sex: "male",
          activityLevel: "active",
          displayName: "Integration Test User",
        },
        programState: validProgramState(),
        weekSchedule: validWeekSchedule(),
      },
      { auth: { uid: TEST_UID } }
    );
    expect(result).toMatchObject({ success: true });

    // Profile doc — should exist with ownership-forced fields.
    const userDoc = await getDocSettled(db.collection("users").doc(TEST_UID));
    expect(userDoc.exists).toBe(true);
    const userData = userDoc.data();
    expect(userData.uid).toBe(TEST_UID);
    expect(userData.subscriptionTier).toBe("free");
    expect(userData.onboardingComplete).toBe(true);
    expect(Array.isArray(userData.weekSchedule)).toBe(true);
    expect(userData.weekSchedule.length).toBe(7);
    expect(userData.weekScheduleVersion).toBe(1);

    // programState doc — committed in the same batch.
    const psDoc = await getDocSettled(
      db
        .collection("users")
        .doc(TEST_UID)
        .collection("programState")
        .doc("current")
    );
    expect(psDoc.exists).toBe(true);
    const psData = psDoc.data();
    expect(psData.programSchemaVersion).toBe(2);
    expect(Array.isArray(psData.runDays)).toBe(true);
    expect(psData.runDays[0].status).toBe("planned");
  });

  it("rejects a tombstoned account with account-deleted and recreates NOTHING", async () => {
    await seedCompletedDeletionTombstone(TEST_UID);
    await expect(
      completeOnboarding.run(
        {
          profileData: {
            ...validProfileUpdates(),
            weightKg: 70,
            heightCm: 175,
            age: 30,
            sex: "male",
            activityLevel: "moderate",
          },
          programState: validProgramState(),
          weekSchedule: validWeekSchedule(),
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { errorCode: "account-deleted", uid: TEST_UID },
    });
    const userDoc = await db.collection("users").doc(TEST_UID).get();
    expect(userDoc.exists).toBe(false);
    const psDoc = await db
      .collection("users")
      .doc(TEST_UID)
      .collection("programState")
      .doc("current")
      .get();
    expect(psDoc.exists).toBe(false);
  });
});

// ── Free-week cap per address (Sub1a pin 1's mitigation) ─────────────
//
// The onboarding free week is per account and needs no card; after three
// grants from one network address in seven days, further accounts from
// it onboard as free. Driven through the real callable against the
// emulator with the forwarded-for header the platform sets, so the
// accounting that runs in production is the accounting under test.
const { ipKey } = require("../../lib/trialIpCap");
const CAP_IP = "203.0.113.77";
const OTHER_IP = "198.51.100.5";
const CAP_UIDS = [
  "u-ipcap-1",
  "u-ipcap-2",
  "u-ipcap-3",
  "u-ipcap-4",
  "u-ipcap-5",
];

async function clearCapState() {
  for (const uid of CAP_UIDS) {
    const userRef = db.collection("users").doc(uid);
    await userRef
      .collection("programState")
      .doc("current")
      .delete()
      .catch(() => {});
    await userRef.delete().catch(() => {});
    await db
      .collection("trialLedger")
      .doc(uid)
      .delete()
      .catch(() => {});
    await db
      .collection("rateLimits")
      .doc(`${uid}_onboarding`)
      .delete()
      .catch(() => {});
  }
  for (const ip of [CAP_IP, OTHER_IP]) {
    await db
      .collection("rateLimits")
      .doc(`${ipKey(ip)}_trialGrant`)
      .delete()
      .catch(() => {});
  }
}

async function onboardFrom(uid, ip) {
  const result = await completeOnboarding.run(
    {
      profileData: {
        ...validProfileUpdates(),
        weightKg: 72,
        heightCm: 180,
        age: 28,
        sex: "male",
        activityLevel: "active",
      },
      programState: validProgramState(),
      weekSchedule: validWeekSchedule(),
    },
    { auth: { uid }, rawRequest: { headers: { "x-forwarded-for": ip } } }
  );
  expect(result).toMatchObject({ success: true });
  const doc = await getDocSettled(db.collection("users").doc(uid));
  return doc.data();
}

suite("completeOnboarding — free-week cap per address", () => {
  beforeEach(async () => {
    await clearCapState();
  });

  it("grants three free weeks from one address, then onboards the fourth as free — and a different address is unaffected", async () => {
    for (const uid of CAP_UIDS.slice(0, 3)) {
      const data = await onboardFrom(uid, CAP_IP);
      expect(typeof data.trialExpiresAt, uid).toBe("string");
      expect(Date.parse(data.trialExpiresAt)).toBeGreaterThan(Date.now());
    }

    const fourth = await onboardFrom("u-ipcap-4", CAP_IP);
    expect(fourth.onboardingComplete).toBe(true);
    expect(fourth.subscriptionTier).toBe("free");
    expect(fourth.trialExpiresAt ?? null).toBeNull();
    // No durable marker either: nothing was granted, so nothing to tombstone.
    const ledger = await db.collection("trialLedger").doc("u-ipcap-4").get();
    expect(ledger.exists).toBe(false);

    const fifth = await onboardFrom("u-ipcap-5", OTHER_IP);
    expect(typeof fifth.trialExpiresAt).toBe("string");

    // The window doc carries the hash and timestamps, never the address.
    const window = await db
      .collection("rateLimits")
      .doc(`${ipKey(CAP_IP)}_trialGrant`)
      .get();
    expect(window.exists).toBe(true);
    expect(window.data().timestamps).toHaveLength(3);
    expect(JSON.stringify(window.data())).not.toContain(CAP_IP);
    expect(window.id).not.toContain(CAP_IP);
  });

  it("with no address on the request, the free week is granted as before", async () => {
    const result = await completeOnboarding.run(
      {
        profileData: {
          ...validProfileUpdates(),
          weightKg: 72,
          heightCm: 180,
          age: 28,
          sex: "male",
          activityLevel: "active",
        },
        programState: validProgramState(),
        weekSchedule: validWeekSchedule(),
      },
      { auth: { uid: "u-ipcap-1" } }
    );
    expect(result).toMatchObject({ success: true });
    const doc = await getDocSettled(db.collection("users").doc("u-ipcap-1"));
    expect(typeof doc.data().trialExpiresAt).toBe("string");
  });
});

suite("configurePlan — concurrent edits", () => {
  beforeEach(clearTestUserState);
  it("preserves a newer completion and unrelated profile fields", async () => {
    const base = validProgramState();
    const baseProfile = validProfileUpdates();
    const current = {
      ...base,
      fatigueScore: 15,
      workouts: [
        {
          dayName: "Push",
          dayType: "push",
          completed: true,
          completedWorkoutId: "saved",
          exercises: [],
        },
      ],
    };
    const user = db.doc(`users/${TEST_UID}`);
    const program = user.collection("programState").doc("current");
    await user.set({ ...baseProfile, displayName: "Latest name" });
    await program.set(current);
    await configurePlan.run(
      {
        baseProgramState: base,
        baseProfile,
        profileUpdates: baseProfile,
        weekSchedule: validWeekSchedule(),
        programState: {
          ...base,
          settings: { autoProgression: false, microloading: true },
        },
      },
      { auth: { uid: TEST_UID } }
    );
    expect((await program.get()).data()).toMatchObject({
      workouts: current.workouts,
      fatigueScore: 15,
      settings: { autoProgression: false, microloading: true },
    });
    expect((await user.get()).data().displayName).toBe("Latest name");
  });

  it("rejects a conflicting rebuild without applying its profile half", async () => {
    const base = validProgramState();
    const baseProfile = validProfileUpdates();
    const user = db.doc(`users/${TEST_UID}`);
    const program = user.collection("programState").doc("current");
    const current = {
      ...base,
      workouts: [
        { dayName: "Push", dayType: "push", completed: true, exercises: [] },
      ],
    };
    await user.set(baseProfile);
    await program.set(current);
    await expect(
      configurePlan.run(
        {
          baseProgramState: base,
          baseProfile,
          profileUpdates: { ...baseProfile, primaryGoal: "strength" },
          weekSchedule: validWeekSchedule(),
          programState: {
            ...base,
            workouts: [
              {
                dayName: "New plan",
                dayType: "push",
                completed: false,
                exercises: [],
              },
            ],
          },
        },
        { auth: { uid: TEST_UID } }
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect((await program.get()).data()).toEqual(current);
    expect((await user.get()).data()).toEqual(baseProfile);
  });
});

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

async function clearTestUserState() {
  // Wipe rate-limit entries for both callables so each test starts
  // unthrottled. configurePlan + onboarding use distinct action
  // keys, but clearing both is cheap and avoids cross-test bleed.
  await db.collection("rateLimits").doc(`${TEST_UID}_configurePlan`).delete().catch(() => {});
  await db.collection("rateLimits").doc(`${TEST_UID}_onboarding`).delete().catch(() => {});
  // Wipe user + programState so atomic-write assertions can
  // observe a fresh write.
  const userRef = db.collection("users").doc(TEST_UID);
  await userRef.collection("programState").doc("current").delete().catch(() => {});
  await userRef.delete().catch(() => {});
}

suite("configurePlan — emulator integration", () => {
  beforeEach(async () => {
    await clearTestUserState();
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
        { auth: { uid: TEST_UID } },
      ),
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
        { auth: { uid: TEST_UID } },
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects payload missing profileUpdates entirely (invalid-argument)", async () => {
    await expect(
      configurePlan.run(
        { programState: validProgramState(), weekSchedule: validWeekSchedule() },
        { auth: { uid: TEST_UID } },
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
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
        { auth: { uid: TEST_UID } },
      ),
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
      { auth: { uid: TEST_UID } },
    );
    expect(result).toMatchObject({ success: true });

    // Profile doc — should exist with ownership-forced fields.
    const userDoc = await db.collection("users").doc(TEST_UID).get();
    expect(userDoc.exists).toBe(true);
    const userData = userDoc.data();
    expect(userData.uid).toBe(TEST_UID);
    expect(userData.subscriptionTier).toBe("free");
    expect(userData.onboardingComplete).toBe(true);
    expect(Array.isArray(userData.weekSchedule)).toBe(true);
    expect(userData.weekSchedule.length).toBe(7);
    expect(userData.weekScheduleVersion).toBe(1);

    // programState doc — committed in the same batch.
    const psDoc = await db
      .collection("users")
      .doc(TEST_UID)
      .collection("programState")
      .doc("current")
      .get();
    expect(psDoc.exists).toBe(true);
    const psData = psDoc.data();
    expect(psData.programSchemaVersion).toBe(2);
    expect(Array.isArray(psData.runDays)).toBe(true);
    expect(psData.runDays[0].status).toBe("planned");
  });
});

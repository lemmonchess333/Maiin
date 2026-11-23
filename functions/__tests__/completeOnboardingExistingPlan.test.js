/**
 * Setup builds a plan only for an account that has none (A6). The app
 * reads the account from the server before it sends, and keeps a plan it
 * finds; `completeOnboarding` holds the same rule, for a profile copy from
 * before the plan and for two phones finishing at once. It refuses with
 * `already-exists`, which the app takes as "keep the plan", and writes
 * nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const admin = require("../lib/adminSdk");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { completeOnboarding } = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const uid = "setup-once-user";
const actor = { auth: { uid } };
const userPath = `users/${uid}`;
const programPath = `users/${uid}/programState/current`;
const publicPath = `users/${uid}/public/profile`;

function request(name, programState = { goal: "strength" }) {
  return {
    profileData: {
      displayName: name,
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "female",
      activityLevel: "moderate",
      primaryGoal: "strength",
    },
    programState,
    healthDataConsent: { version: 1 },
  };
}

let db;
beforeEach(() => {
  db = memoryFirestore();
  let timestampCalls = 0;
  Object.defineProperty(admin, "firestore", {
    value: Object.assign(() => db, admin.firestore, {
      FieldValue: {
        serverTimestamp: () => `SERVER_TS_${++timestampCalls}`,
        delete: () => "DELETE",
      },
    }),
    configurable: true,
    writable: true,
  });
  rateLimiter.isRateLimited = async () => false;
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
});

afterEach(() => {
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
});

/** Every document under the account, as stored. */
function stored() {
  return [...db.data.entries()].filter(([path]) => path.startsWith(userPath));
}

describe("completeOnboarding on an account that already has a plan", () => {
  it("builds the plan for an account made at sign-up, with none yet", async () => {
    db.data.set(userPath, { uid, onboardingComplete: false });
    await expect(
      completeOnboarding.run(request("Robin"), actor)
    ).resolves.toMatchObject({ success: true });
    expect(db.data.get(userPath)).toMatchObject({
      onboardingComplete: true,
      displayName: "Robin",
    });
    expect(db.data.get(programPath)).toMatchObject({ goal: "strength" });
  });

  it("refuses one whose setup is finished, and writes nothing", async () => {
    db.data.set(userPath, {
      uid,
      onboardingComplete: true,
      displayName: "Sam",
      primaryGoal: "hypertrophy",
    });
    db.data.set(programPath, { goal: "hypertrophy" });
    db.data.set(publicPath, { uid, displayName: "Sam" });
    const before = stored();
    await expect(
      completeOnboarding.run(request("Robin"), actor)
    ).rejects.toMatchObject({
      code: "already-exists",
      message: "This account already has a plan.",
    });
    expect(stored()).toEqual(before);
  });

  it("refuses one with a programme stored, however its profile reads", async () => {
    // A profile that does not say setup finished (a copy from before the
    // plan, or one written over) beside a programme that is there.
    db.data.set(userPath, { uid, onboardingComplete: false });
    db.data.set(programPath, { goal: "hypertrophy" });
    const before = stored();
    await expect(
      completeOnboarding.run(request("Robin"), actor)
    ).rejects.toMatchObject({ code: "already-exists" });
    expect(stored()).toEqual(before);
  });

  it("of two phones finishing setup, keeps the plan of the first", async () => {
    await completeOnboarding.run(request("Robin", { goal: "strength" }), actor);
    const first = stored();
    await expect(
      completeOnboarding.run(request("Robin", { goal: "hypertrophy" }), actor)
    ).rejects.toMatchObject({ code: "already-exists" });
    expect(stored()).toEqual(first);
    expect(db.data.get(programPath)).toMatchObject({ goal: "strength" });
  });
});

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
const actor = { auth: { uid: "activation-user-v2" } };
const path = "users/activation-user-v2";

function request(version, platform) {
  return {
    ...(version === undefined ? {} : { activationJourneyVersion: version }),
    ...(platform === undefined ? {} : { onboardingPlatform: platform }),
    profileData: {
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male",
      activityLevel: "moderate",
      athleteType: "Runner",
    },
    programState: {},
    // Setup's agreement to store health details (Priv1 call 1).
    healthDataConsent: { version: 1 },
  };
}

let db;
let timestampCalls;
beforeEach(() => {
  db = memoryFirestore();
  timestampCalls = 0;
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

/* App1 (whole-app grill Q27): every new account is stamped with the one
   journey, 2, whatever its client sent. The comparison group, its share
   and its switch are gone. */
describe("completeOnboarding activation journey", () => {
  it("stamps every new account 2, with no comparison group", async () => {
    // Uids XB1's hash once put in the comparison group, and a config that
    // once switched v2 off: neither decides anything now.
    db.data.set("system/config", {
      activationJourneyV2Enabled: false,
      activationComparisonPercent: 100,
    });
    for (const uid of ["cohort-0", "cohort-1", "cohort-2"]) {
      expect(
        await completeOnboarding.run(request(2, "ios"), { auth: { uid } })
      ).toEqual({ success: true, activationJourneyVersion: 2 });
      expect(db.data.get(`users/${uid}`).activationJourneyVersion).toBe(2);
      expect(db.data.get(`users/${uid}`).onboardingPlatform).toBe("ios");
    }
  });

  it("stamps an older client that sends no version 2 as well, with its platform when given", async () => {
    expect(await completeOnboarding.run(request(), actor)).toEqual({
      success: true,
      activationJourneyVersion: 2,
    });
    expect(db.data.get(path).activationJourneyVersion).toBe(2);
    expect(db.data.get(path).onboardingPlatform).toBeUndefined();

    const other = { auth: { uid: "activation-user-platform" } };
    await completeOnboarding.run(request(undefined, "web"), other);
    expect(
      db.data.get("users/activation-user-platform").onboardingPlatform
    ).toBe("web");
  });

  it("stamps the first setup's timestamp, sport, platform and launch numbers", async () => {
    expect(await completeOnboarding.run(request(2, "ios"), actor)).toEqual({
      success: true,
      activationJourneyVersion: 2,
    });
    const first = db.data.get(path);
    expect(first.activationJourneyVersion).toBe(2);
    expect(first.onboardingPlatform).toBe("ios");
    expect(first.onboardingSport).toBe("runner");
    expect(first.onboardingCompletedAt).toMatch(/^SERVER_TS_/);
    // App1 Q17: this account's launch numbers are kept from here.
    expect(first.launchMilestones).toEqual({});
  });

  it("refuses a second setup, so nothing it stamped moves", async () => {
    await completeOnboarding.run(request(2, "ios"), actor);
    const kept = {
      firstSession: { atMs: 1, kind: "run", daysSinceSetup: 0 },
    };
    db.data.set(path, { ...db.data.get(path), launchMilestones: kept });
    const first = db.data.get(path);
    const retry = request(undefined, "web");
    retry.profileData.athleteType = "Lifter";
    await expect(completeOnboarding.run(retry, actor)).rejects.toMatchObject({
      code: "already-exists",
    });
    expect(db.data.get(path)).toEqual(first);
  });

  it("refuses an account set up before, whatever it was stamped", async () => {
    for (const [uid, stamped] of [
      ["activation-user-comparison", 1],
      ["activation-user-unstamped", undefined],
    ]) {
      const before = {
        uid,
        onboardingComplete: true,
        onboardingCompletedAt: "SETUP_BEFORE",
        ...(stamped === undefined ? {} : { activationJourneyVersion: stamped }),
      };
      db.data.set(`users/${uid}`, before);
      await expect(
        completeOnboarding.run(request(2, "ios"), { auth: { uid } })
      ).rejects.toMatchObject({ code: "already-exists" });
      expect(db.data.get(`users/${uid}`)).toEqual(before);
    }
  });

  it("rejects unsupported versions and commits no profile", async () => {
    await expect(
      completeOnboarding.run(request(1), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
  });

  it("rejects an invalid platform and commits no profile", async () => {
    await expect(
      completeOnboarding.run(request(2, "tablet"), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      completeOnboarding.run(request(undefined, "tablet"), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
  });
});

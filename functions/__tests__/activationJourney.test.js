import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const admin = require("firebase-admin");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { completeOnboarding } = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const actor = { auth: { uid: "activation-user" } };
const path = "users/activation-user";

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

describe("completeOnboarding activation journey", () => {
  it("accepts v2 once and keeps its original timestamp on a legacy retry", async () => {
    expect(await completeOnboarding.run(request(2, "ios"), actor)).toEqual({
      success: true,
      activationJourneyVersion: 2,
    });
    const first = db.data.get(path);
    expect(first.activationJourneyVersion).toBe(2);
    expect(first.onboardingPlatform).toBe("ios");
    expect(first.onboardingSport).toBe("runner");
    expect(first.onboardingCompletedAt).toMatch(/^SERVER_TS_/);

    const retry = request();
    retry.profileData.athleteType = "Lifter";
    expect(await completeOnboarding.run(retry, actor)).toEqual({
      success: true,
      activationJourneyVersion: 2,
    });
    expect(db.data.get(path).onboardingCompletedAt).toBe(
      first.onboardingCompletedAt
    );
    expect(db.data.get(path).activationJourneyVersion).toBe(2);
    expect(db.data.get(path).onboardingPlatform).toBe("ios");
    expect(db.data.get(path).onboardingSport).toBe("runner");
  });

  it("does not enroll a completed legacy profile on a v2 retry", async () => {
    expect(await completeOnboarding.run(request(), actor)).toEqual({
      success: true,
      activationJourneyVersion: null,
    });
    const first = db.data.get(path);

    expect(await completeOnboarding.run(request(2), actor)).toEqual({
      success: true,
      activationJourneyVersion: null,
    });
    expect(db.data.get(path).activationJourneyVersion).toBeUndefined();
    expect(db.data.get(path).onboardingCompletedAt).toBe(
      first.onboardingCompletedAt
    );
  });

  it("rejects unsupported versions and commits no profile", async () => {
    await expect(
      completeOnboarding.run(request(1), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
  });

  it("rejects an invalid platform and never upgrades a completed legacy account", async () => {
    await expect(
      completeOnboarding.run(request(2, "tablet"), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
    await completeOnboarding.run(request(), actor);
    await completeOnboarding.run(request(2, "ios"), actor);
    expect(db.data.get(path).onboardingPlatform).toBeUndefined();
  });
});

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

function request(version) {
  return {
    ...(version === undefined ? {} : { activationJourneyVersion: version }),
    profileData: {
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male",
      activityLevel: "moderate",
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
    expect(await completeOnboarding.run(request(2), actor)).toEqual({
      success: true,
      activationJourneyVersion: 2,
    });
    const first = db.data.get(path);
    expect(first.activationJourneyVersion).toBe(2);
    expect(first.onboardingCompletedAt).toMatch(/^SERVER_TS_/);

    expect(await completeOnboarding.run(request(), actor)).toEqual({
      success: true,
      activationJourneyVersion: 2,
    });
    expect(db.data.get(path).onboardingCompletedAt).toBe(
      first.onboardingCompletedAt
    );
    expect(db.data.get(path).activationJourneyVersion).toBe(2);
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
});

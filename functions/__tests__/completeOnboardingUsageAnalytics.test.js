/**
 * Share usage analytics carried from setup (owner, 23 November 2026). The
 * agreement's analytics line ends in Turn off, which can be tapped before
 * there is an account; setup sends `usageAnalytics: false` beside the plan
 * and completeOnboarding writes the field the Settings switch writes. An
 * account that already has an answer keeps it, and profileData cannot
 * carry one.
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
const actor = { auth: { uid: "analytics-setup-user" } };
const path = "users/analytics-setup-user";
const year = new Date().getUTCFullYear();

function request(extra = {}, profileExtra = {}) {
  return {
    profileData: {
      weightKg: 70,
      heightCm: 175,
      birthYear: year - 30,
      sex: "female",
      activityLevel: "moderate",
      ...profileExtra,
    },
    programState: {},
    // Setup is refused without the agreement to store health details (Priv1).
    healthDataConsent: { version: 1 },
    ...extra,
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

describe("completeOnboarding and Share usage analytics", () => {
  it("carries setup's Turn off onto the new account", async () => {
    await completeOnboarding.run(request({ usageAnalytics: false }), actor);
    expect(db.data.get(path).usageAnalytics).toBe(false);
  });

  it("writes nothing when setup sends no answer: on, by default", async () => {
    await completeOnboarding.run(request(), actor);
    expect(db.data.get(path)).not.toHaveProperty("usageAnalytics");
  });

  it("never overwrites an answer the account already has", async () => {
    db.data.set(path, { usageAnalytics: true });
    await completeOnboarding.run(request({ usageAnalytics: false }), actor);
    expect(db.data.get(path).usageAnalytics).toBe(true);
  });

  it("never takes it from profileData", async () => {
    await completeOnboarding.run(
      request({}, { usageAnalytics: false }),
      actor
    );
    expect(db.data.get(path)).not.toHaveProperty("usageAnalytics");
  });

  it("refuses an answer that is not true or false", async () => {
    await expect(
      completeOnboarding.run(request({ usageAnalytics: "off" }), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
  });
});

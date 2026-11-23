/**
 * Setup is not saved without the agreement to store health details (Priv1
 * call 1, owner 2026-11-21).
 *
 * Setup asks before its first body question, and sends the answer beside
 * the plan as `healthDataConsent: { version }`. `completeOnboarding`
 * refuses a setup without it, with a sentence the app shows as it is, and
 * writes nothing; with it, the account carries `{ at, version }`, the time
 * being the server's, whatever the request said.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const admin = require("../lib/adminSdk");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const healthConsent = require("../lib/healthConsent");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { completeOnboarding } = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const actor = { auth: { uid: "consent-user" } };
const path = "users/consent-user";
const year = new Date().getUTCFullYear();

function request(extra) {
  return {
    profileData: {
      weightKg: 70,
      heightCm: 175,
      birthYear: year - 30,
      sex: "female",
      activityLevel: "moderate",
    },
    programState: {},
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

describe("completeOnboarding and the health-data agreement", () => {
  it("stores the agreement with the server's time and the wording's version", async () => {
    await expect(
      completeOnboarding.run(
        request({
          healthDataConsent: {
            version: healthConsent.HEALTH_DATA_CONSENT_VERSION,
          },
        }),
        actor
      )
    ).resolves.toMatchObject({ success: true });
    const stored = db.data.get(path);
    expect(stored.onboardingComplete).toBe(true);
    expect(stored.healthDataConsent).toEqual({
      at: expect.stringMatching(/^SERVER_TS_/),
      version: healthConsent.HEALTH_DATA_CONSENT_VERSION,
    });
  });

  it("keeps the server's time over one the request sends", async () => {
    await completeOnboarding.run(
      request({
        healthDataConsent: {
          version: healthConsent.HEALTH_DATA_CONSENT_VERSION,
          at: "2020-01-01T00:00:00Z",
        },
      }),
      actor
    );
    // The extra key does not make the agreement unacceptable, and the
    // request's date is not the one stored.
    expect(db.data.get(path).healthDataConsent.at).toMatch(/^SERVER_TS_/);
  });

  it("does not take an agreement smuggled in with the profile", async () => {
    await expect(
      completeOnboarding.run(
        request({
          profileData: {
            ...request().profileData,
            healthDataConsent: { version: 1, at: "2020-01-01T00:00:00Z" },
          },
        }),
        actor
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(db.data.has(path)).toBe(false);
  });

  it.each([
    ["no agreement", undefined],
    ["an empty one", {}],
    ["an older wording", { version: 0 }],
    ["a wording this server does not know", { version: 2 }],
    ["a version as text", { version: "1" }],
    ["a bare yes", true],
  ])("refuses setup with %s, and saves nothing", async (_case, consent) => {
    await expect(
      completeOnboarding.run(request({ healthDataConsent: consent }), actor)
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: healthConsent.HEALTH_CONSENT_REQUIRED_MESSAGE,
      details: { reason: healthConsent.HEALTH_CONSENT_REQUIRED },
    });
    expect(db.data.has(path)).toBe(false);
    expect(db.data.has(`${path}/programState/current`)).toBe(false);
  });
});

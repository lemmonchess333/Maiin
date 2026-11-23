/**
 * Setup sends `sex` only when it was answered (owner, 22 November 2026).
 *
 * `completeOnboarding` required `sex`, and setup sent `sex: "male"` for
 * every answer but female, "Prefer not to say" included, so the calorie
 * maths and the first weights took the male figures for someone who had
 * not said. Setup now sends no `sex` for that answer, and the app's maths
 * take the midpoint of the two (`src/lib/sex.ts`). The server stores what
 * was answered and nothing in its place.
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
const actor = { auth: { uid: "sex-answer-user" } };
const path = "users/sex-answer-user";
const THIRTY = new Date().getUTCFullYear() - 30;

function request(answer) {
  return {
    profileData: {
      weightKg: 70,
      heightCm: 175,
      birthYear: THIRTY,
      activityLevel: "moderate",
      ...answer,
    },
    programState: {},
    // Setup's agreement to store health details (Priv1 call 1).
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

describe("completeOnboarding and an unanswered sex", () => {
  it("saves Prefer not to say with no `sex`, and keeps the answer itself", async () => {
    await expect(
      completeOnboarding.run(request({ gender: "unspecified" }), actor)
    ).resolves.toMatchObject({ success: true });
    const stored = db.data.get(path);
    expect(stored.onboardingComplete).toBe(true);
    expect(stored.gender).toBe("unspecified");
    expect(stored).not.toHaveProperty("sex");
  });

  it("drops a value that is neither female nor male, and still saves", async () => {
    await expect(
      completeOnboarding.run(
        request({ gender: "unspecified", sex: "other" }),
        actor
      )
    ).resolves.toMatchObject({ success: true });
    expect(db.data.get(path)).not.toHaveProperty("sex");
  });

  it.each(["female", "male"])("stores an answer of %s as sent", async (sex) => {
    await expect(
      completeOnboarding.run(request({ gender: sex, sex }), actor)
    ).resolves.toMatchObject({ success: true });
    const stored = db.data.get(path);
    expect(stored.sex).toBe(sex);
    expect(stored.gender).toBe(sex);
  });

  it("still requires the other body figures", async () => {
    const { weightKg: _dropped, ...noWeight } = request({}).profileData;
    await expect(
      completeOnboarding.run({ ...request({}), profileData: noWeight }, actor)
    ).rejects.toMatchObject({
      code: "invalid-argument",
      message: "Missing required field: weightKg",
    });
    expect(db.data.has(path)).toBe(false);
  });
});

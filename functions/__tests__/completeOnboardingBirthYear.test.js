/**
 * Setup sends a year of birth, not an age (App1, grill Q57; the owner chose
 * the year over a full date, 13 November 2026).
 *
 * `completeOnboarding` required `age`, the midpoint of the range setup used
 * to ask. Setup now asks the year of birth and sends only that: the age is
 * worked out from it when it is read, and the year is the one stored copy
 * of the fact (Q21). A client still running an older bundle sends `age`,
 * which keeps working.
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
const actor = { auth: { uid: "birth-year-user" } };
const path = "users/birth-year-user";

/* Derived from the clock, so inside (and outside) 16 to 120 whatever year
   the suite runs. */
const year = new Date().getUTCFullYear();
const THIRTY = year - 30;
const UNDER_16 = year - 10;

function request(age) {
  return {
    profileData: {
      weightKg: 70,
      heightCm: 175,
      ...age,
      sex: "female",
      activityLevel: "moderate",
    },
    programState: {},
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

describe("completeOnboarding and the year of birth", () => {
  it("takes a year of birth in place of an age, and stores only the year", async () => {
    await expect(
      completeOnboarding.run(request({ birthYear: THIRTY }), actor)
    ).resolves.toMatchObject({ success: true });
    const stored = db.data.get(path);
    expect(stored.birthYear).toBe(THIRTY);
    expect(stored).not.toHaveProperty("age");
    expect(stored).not.toHaveProperty("ageRange");
  });

  it("refuses a year of birth that makes the person under 16, by its name", async () => {
    await expect(
      completeOnboarding.run(request({ birthYear: UNDER_16 }), actor)
    ).rejects.toMatchObject({
      code: "invalid-argument",
      message: "Missing required field: birthYear",
    });
    expect(db.data.has(path)).toBe(false);
  });

  it("does not let an age stand in for a year of birth it refused", async () => {
    await expect(
      completeOnboarding.run(request({ birthYear: "1990", age: 30 }), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
  });

  it("still takes the age an older client sends", async () => {
    await expect(
      completeOnboarding.run(request({ age: 30, ageRange: "25-34" }), actor)
    ).resolves.toMatchObject({ success: true });
    expect(db.data.get(path).age).toBe(30);
  });

  it("refuses a request with neither", async () => {
    await expect(
      completeOnboarding.run(request({}), actor)
    ).rejects.toMatchObject({
      code: "invalid-argument",
      message: "Missing required field: age",
    });
  });
});

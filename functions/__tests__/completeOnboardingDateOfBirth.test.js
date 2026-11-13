/**
 * Setup sends a date of birth, not an age (App1, grill Q57).
 *
 * `completeOnboarding` required `age`, the midpoint of the range setup used
 * to ask. Setup now asks the date of birth and sends only that: the age is
 * worked out from it when it is read, and the date is the one stored copy
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
const activationCohort = require("../lib/activationCohort");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const actor = { auth: { uid: "date-of-birth-user" } };
const path = "users/date-of-birth-user";

/* Derived from the clock: 30 years ago on 1 January is 30 on any day of
   this year, and so inside 16 to 120 whatever day the suite runs. */
const year = new Date().getUTCFullYear();
const THIRTY = `${year - 30}-01-01`;
const UNDER_16 = `${year - 10}-01-01`;

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
  activationCohort.resetCacheForTests();
});

afterEach(() => {
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
});

describe("completeOnboarding and the date of birth", () => {
  it("takes a date of birth in place of an age, and stores only the date", async () => {
    await expect(
      completeOnboarding.run(request({ dateOfBirth: THIRTY }), actor)
    ).resolves.toMatchObject({ success: true });
    const stored = db.data.get(path);
    expect(stored.dateOfBirth).toBe(THIRTY);
    expect(stored).not.toHaveProperty("age");
    expect(stored).not.toHaveProperty("ageRange");
  });

  it("refuses a date of birth that makes the person under 16, by its name", async () => {
    await expect(
      completeOnboarding.run(request({ dateOfBirth: UNDER_16 }), actor)
    ).rejects.toMatchObject({
      code: "invalid-argument",
      message: "Missing required field: dateOfBirth",
    });
    expect(db.data.has(path)).toBe(false);
  });

  it("does not let an age stand in for a date of birth it refused", async () => {
    await expect(
      completeOnboarding.run(
        request({ dateOfBirth: "1990-02-30", age: 30 }),
        actor
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
  });

  it("still takes the age an older client sends", async () => {
    await expect(
      completeOnboarding.run(
        request({ age: 30, ageRange: "25-34" }),
        actor
      )
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

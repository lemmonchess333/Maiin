/**
 * Setup's email opt-in (App1 Q55). The last step of setup asks once, off
 * until the person turns it on; ticked, completeOnboarding is sent
 * `emailOptIn: true` with the words the toggle showed, and records a yes to
 * both emails with the server's time. Unticked, nothing is recorded. The
 * record never comes from profileData, where a client could write anything.
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
const actor = { auth: { uid: "email-setup-user" } };
const path = "users/email-setup-user";
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

describe("completeOnboarding and the email opt-in", () => {
  it("records a yes to both emails, with the server's time, where and which words", async () => {
    await completeOnboarding.run(
      request({ emailOptIn: true, emailWording: 1 }),
      actor
    );
    const { emailConsent } = db.data.get(path);
    for (const kind of ["weeklyReview", "winBack"]) {
      expect(emailConsent[kind]).toMatchObject({
        on: true,
        givenVia: "setup",
        wording: 1,
      });
      expect(emailConsent[kind].givenAt).toMatch(/^SERVER_TS_/);
    }
  });

  it("records nothing when the toggle was left off", async () => {
    await completeOnboarding.run(request({ emailOptIn: false }), actor);
    expect(db.data.get(path)).not.toHaveProperty("emailConsent");
  });

  it("records nothing for a client from before the question", async () => {
    await completeOnboarding.run(request(), actor);
    expect(db.data.get(path)).not.toHaveProperty("emailConsent");
  });

  it("drops a consent record sent inside profileData", async () => {
    await completeOnboarding.run(
      request(
        {},
        {
          emailConsent: {
            weeklyReview: {
              on: true,
              givenAt: "2020-01-01",
              givenVia: "setup",
            },
          },
        }
      ),
      actor
    );
    expect(db.data.get(path)).not.toHaveProperty("emailConsent");
  });

  it("refuses a malformed answer before writing anything", async () => {
    await expect(
      completeOnboarding.run(request({ emailOptIn: "yes" }), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      completeOnboarding.run(request({ emailOptIn: true }), actor)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.has(path)).toBe(false);
  });

  it("keeps an answer already on the account that setup was not asked to change", async () => {
    const earlier = {
      weeklyReview: {
        on: false,
        givenAt: "OLD",
        givenVia: "setup",
        wording: 1,
        withdrawnAt: "LATER",
        withdrawnVia: "unsubscribe",
      },
    };
    db.data.set(path, {
      uid: "email-setup-user",
      onboardingComplete: false,
      emailConsent: earlier,
    });
    await completeOnboarding.run(request(), actor);
    expect(db.data.get(path).emailConsent).toEqual(earlier);
  });
});

/**
 * setEmailConsent: the Settings switches for the two emails (App1 Q55).
 * The record is the server's to write, with its own time, so the switch
 * is a call; these pin that the call records what was asked, when and to
 * which words, refuses what it should, and never touches anything else on
 * the profile.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const admin = require("../lib/adminSdk");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { setEmailConsent } = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const UID = "email-user";
const actor = { auth: { uid: UID } };
const path = `users/${UID}`;

let db;
let limited;
let deleting;
let calls;
beforeEach(() => {
  db = memoryFirestore({
    [path]: { uid: UID, displayName: "Sam", onboardingComplete: true },
  });
  calls = 0;
  limited = false;
  deleting = false;
  Object.defineProperty(admin, "firestore", {
    value: Object.assign(() => db, admin.firestore, {
      FieldValue: { serverTimestamp: () => `SERVER_TS_${++calls}` },
    }),
    configurable: true,
    writable: true,
  });
  rateLimiter.isRateLimited = async () => limited;
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {
    if (deleting) {
      const err = new Error("Account deletion in progress.");
      err.code = "failed-precondition";
      throw err;
    }
  };
});

afterEach(() => {
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
});

describe("setEmailConsent", () => {
  it("records a yes from Settings with the server's time and the words", async () => {
    await expect(
      setEmailConsent.run({ weeklyReview: true, wording: 1 }, actor)
    ).resolves.toEqual({
      emailConsent: { weeklyReview: true, winBack: false },
    });
    const stored = db.data.get(path);
    expect(stored.emailConsent).toEqual({
      weeklyReview: {
        on: true,
        givenAt: "SERVER_TS_1",
        givenVia: "settings",
        wording: 1,
      },
    });
    // Nothing else on the profile moved.
    expect(stored.displayName).toBe("Sam");
  });

  it("records a no from Settings and keeps the yes it withdraws", async () => {
    db.data.set(path, {
      uid: UID,
      emailConsent: {
        weeklyReview: {
          on: true,
          givenAt: "SETUP_TS",
          givenVia: "setup",
          wording: 1,
        },
        winBack: {
          on: true,
          givenAt: "SETUP_TS",
          givenVia: "setup",
          wording: 1,
        },
      },
    });
    await expect(
      setEmailConsent.run({ winBack: false }, actor)
    ).resolves.toEqual({
      emailConsent: { weeklyReview: true, winBack: false },
    });
    expect(db.data.get(path).emailConsent.winBack).toEqual({
      on: false,
      givenAt: "SETUP_TS",
      givenVia: "setup",
      wording: 1,
      withdrawnAt: "SERVER_TS_1",
      withdrawnVia: "settings",
    });
  });

  it("takes a yes and a no in one call", async () => {
    db.data.set(path, {
      uid: UID,
      emailConsent: {
        winBack: { on: true, givenAt: "T", givenVia: "setup", wording: 1 },
      },
    });
    await expect(
      setEmailConsent.run(
        { weeklyReview: true, winBack: false, wording: 1 },
        actor
      )
    ).resolves.toEqual({
      emailConsent: { weeklyReview: true, winBack: false },
    });
    const stored = db.data.get(path).emailConsent;
    expect(stored.weeklyReview.givenVia).toBe("settings");
    expect(stored.winBack.withdrawnVia).toBe("settings");
  });

  it("writes nothing when the answer is already the one asked", async () => {
    db.data.set(path, {
      uid: UID,
      emailConsent: {
        weeklyReview: {
          on: true,
          givenAt: "FIRST",
          givenVia: "setup",
          wording: 1,
        },
      },
    });
    const before = db.operations.length;
    await setEmailConsent.run({ weeklyReview: true, wording: 1 }, actor);
    expect(db.operations.length).toBe(before);
    expect(db.data.get(path).emailConsent.weeklyReview.givenAt).toBe("FIRST");
  });

  it("refuses someone signed out", async () => {
    await expect(
      setEmailConsent.run({ weeklyReview: true, wording: 1 }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(db.data.get(path).emailConsent).toBeUndefined();
  });

  it.each([
    ["a yes without the words", { weeklyReview: true }],
    ["an email it does not know", { newsletter: true, wording: 1 }],
    ["nothing to change", {}],
  ])("refuses %s, and writes nothing", async (_case, data) => {
    await expect(setEmailConsent.run(data, actor)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expect(db.data.get(path).emailConsent).toBeUndefined();
  });

  it("refuses an account being deleted", async () => {
    deleting = true;
    await expect(
      setEmailConsent.run({ weeklyReview: true, wording: 1 }, actor)
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(db.data.get(path).emailConsent).toBeUndefined();
  });

  it("refuses a loop of calls", async () => {
    limited = true;
    await expect(
      setEmailConsent.run({ weeklyReview: true, wording: 1 }, actor)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(db.data.get(path).emailConsent).toBeUndefined();
  });

  it("refuses an account with no profile yet", async () => {
    db.data.delete(path);
    await expect(
      setEmailConsent.run({ weeklyReview: true, wording: 1 }, actor)
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(db.data.has(path)).toBe(false);
  });
});

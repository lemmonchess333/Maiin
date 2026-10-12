/**
 * The word filter at the callables that write public text, driven through
 * `.run(data, context)`:
 *
 *   - addSpacePostCommentCallable and addCommentCallable refuse a comment
 *     whose text (or the name riding on it) trips the filter, as
 *     failed-precondition with the sentence the client shows, before any
 *     Firestore read: no deletion-lock read, no limiter write, no comment,
 *     no notification.
 *   - completeOnboarding and configurePlan refuse a display name that trips
 *     it, writing nothing.
 *
 * Each refusal test is anchored by a clean twin that gets PAST the filter
 * and stops at the next gate, so a refusal cannot pass just because the
 * call failed somewhere else.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const restriction = require("../lib/restriction");
const socialCounters = require("../lib/socialCounters");
const spacePostEngagement = require("../lib/spacePostEngagement");
const socialFanout = require("../lib/socialFanout");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { REFUSALS } = require("../lib/objectionableText");
const {
  addCommentCallable,
  addSpacePostCommentCallable,
  completeOnboarding,
  configurePlan,
} = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const realAssertNotRestricted = restriction.assertNotRestricted;

const VERIFIED = {
  auth: { uid: "commenter-1", token: { email_verified: true } },
};

let calls;
beforeEach(() => {
  calls = [];
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {
    calls.push("lock");
  };
  // Not restricted (S4e): the restriction read is the gate after the lock.
  restriction.assertNotRestricted = async () => {
    calls.push("restriction");
  };
  // Limited: a call that gets past the filter stops here, before any write.
  rateLimiter.isRateLimited = async () => {
    calls.push("limiter");
    return true;
  };
});

afterEach(() => {
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  restriction.assertNotRestricted = realAssertNotRestricted;
  vi.restoreAllMocks();
});

/** Point admin.firestore() at an in-memory database for one test. */
function useMemoryFirestore(seed = {}) {
  const db = memoryFirestore(seed);
  const ns = Object.assign(() => db, admin.firestore, {
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
  });
  Object.defineProperty(admin, "firestore", {
    value: ns,
    configurable: true,
    writable: true,
  });
  return db;
}

describe.each([
  [
    "addSpacePostCommentCallable",
    addSpacePostCommentCallable,
    { spaceId: "runners", postId: "post-1" },
    () => vi.spyOn(spacePostEngagement, "addSpacePostComment"),
  ],
  [
    "addCommentCallable",
    addCommentCallable,
    { activityId: "act-1" },
    () => vi.spyOn(socialCounters, "addComment"),
  ],
])("%s — the word filter", (_name, callable, ids, spyWriter) => {
  it("refuses objectionable text with the comment sentence, touching nothing", async () => {
    const writer = spyWriter();
    const notify = vi.spyOn(socialFanout, "createNotification");
    await expect(
      callable.run(
        { ...ids, text: "this hill sucks", authorName: "Sam" },
        VERIFIED
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: REFUSALS.comment,
    });
    expect(calls).toEqual([]);
    expect(writer).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses an objectionable name riding on a clean comment", async () => {
    await expect(
      callable.run(
        { ...ids, text: "Nice one", authorName: "shit head" },
        VERIFIED
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: REFUSALS.authorName,
    });
    expect(calls).toEqual([]);
  });

  it("lets a clean comment through to the next gate", async () => {
    await expect(
      callable.run(
        { ...ids, text: "Strong finish", authorName: "Sam" },
        VERIFIED
      )
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(calls).toEqual(["lock", "restriction", "limiter"]);
  });
});

const BODY = {
  weightKg: 70,
  heightCm: 175,
  age: 30,
  sex: "male",
  activityLevel: "moderate",
};

describe("completeOnboarding — the display name", () => {
  beforeEach(() => {
    rateLimiter.isRateLimited = async () => false;
  });

  it("refuses an objectionable name and writes no profile", async () => {
    const db = useMemoryFirestore();
    await expect(
      completeOnboarding.run(
        {
          profileData: { ...BODY, displayName: "shit head" },
          programState: {},
        },
        { auth: { uid: "u1" } }
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: REFUSALS.displayName,
    });
    expect(db.data.has("users/u1")).toBe(false);
    expect(db.operations).toEqual([]);
  });

  it("lets a clean name through to the profile write", async () => {
    const db = useMemoryFirestore();
    await expect(
      completeOnboarding.run(
        { profileData: { ...BODY, displayName: "Sam" }, programState: {} },
        { auth: { uid: "u1" } }
      )
    ).resolves.toEqual({ success: true });
    expect(db.data.get("users/u1")).toMatchObject({
      displayName: "Sam",
      onboardingComplete: true,
    });
  });
});

describe("configurePlan — a display name in the patch", () => {
  beforeEach(() => {
    rateLimiter.isRateLimited = async () => false;
  });

  it("refuses an objectionable name before validating the plan", async () => {
    const db = useMemoryFirestore();
    await expect(
      configurePlan.run(
        { profileUpdates: { displayName: "shit" }, programState: {} },
        { auth: { uid: "u1" } }
      )
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: REFUSALS.displayName,
    });
    expect(db.operations).toEqual([]);
  });

  it("lets a clean name through to the plan validator", async () => {
    useMemoryFirestore();
    // An empty plan fails validation: proof the name check let it pass.
    await expect(
      configurePlan.run(
        { profileUpdates: { displayName: "Sam" }, programState: {} },
        { auth: { uid: "u1" } }
      )
    ).rejects.toMatchObject({
      code: "invalid-argument",
      message: expect.stringContaining("Invalid plan payload"),
    });
  });
});

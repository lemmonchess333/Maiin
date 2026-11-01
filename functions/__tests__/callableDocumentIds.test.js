/**
 * A callable that puts a client's id into a document path takes only an id
 * that names one document (lib/documentId.js). A "/" in one turns it into
 * a path to some other document deeper in the tree, and the Admin SDK
 * writes wherever it points.
 *
 * The Space-post comment callables are the case that could be used: a
 * postId of "P/comments/C" made a comment on comment C and counted it on
 * C, and a commentId of "C/comments/N" deleted N and took it off post P's
 * count, which could be driven below zero. Every other callable that
 * builds a path from the request is held to the same check here, refused
 * as invalid-argument before anything is read or written.
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
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  addCommentCallable,
  addSpacePostCommentCallable,
  deleteCommentCallable,
  deleteSpacePostCommentCallable,
  resolveReport,
  liftRestriction,
  recreditMyLiftVolume,
} = require("../index");
const goalSpaceMembership = require("../lib/goalSpaceMembership");
const goalSpaceCheckIn = require("../lib/goalSpaceCheckIn");
const goalSpaceLifecycle = require("../lib/goalSpaceLifecycle");
const partnerBonds = require("../lib/partnerBonds");
const reportTargets = require("../lib/reportTargets");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const realAssertNotRestricted = restriction.assertNotRestricted;

const ME = "commenter-1";
const VERIFIED = { auth: { uid: ME, token: { email_verified: true } } };
const ADMIN = { auth: { uid: "admin-1" } };

function useMemoryFirestore(seed = {}) {
  const db = memoryFirestore(seed);
  const ns = Object.assign(() => db, admin.firestore, {
    FieldValue: {
      serverTimestamp: () => "SERVER_TS",
      increment: (n) => ({ increment: n }),
    },
  });
  Object.defineProperty(admin, "firestore", {
    value: ns,
    configurable: true,
    writable: true,
  });
  return db;
}

let limiter;
beforeEach(() => {
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
  restriction.assertNotRestricted = async () => {};
  limiter = vi.fn(async () => false);
  rateLimiter.isRateLimited = limiter;
});

afterEach(() => {
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  restriction.assertNotRestricted = realAssertNotRestricted;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a Space-post comment aimed through another comment", () => {
  const seed = () => ({
    "spaces/runners/posts/P": { authorId: "poster", commentCount: 1 },
    "spaces/runners/posts/P/comments/C": {
      authorId: "victim",
      text: "Nice one",
    },
    [`spaces/runners/posts/P/comments/C/comments/N`]: {
      authorId: ME,
      text: "planted",
    },
  });

  it("cannot comment on a comment and count it there", async () => {
    const db = useMemoryFirestore(seed());
    const writer = vi.spyOn(spacePostEngagement, "addSpacePostComment");
    await expect(
      addSpacePostCommentCallable.run(
        { spaceId: "runners", postId: "P/comments/C", text: "x" },
        VERIFIED
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(writer).not.toHaveBeenCalled();
    expect(db.operations).toEqual([]);
    expect(db.data.get("spaces/runners/posts/P/comments/C")).not.toHaveProperty(
      "commentCount"
    );
  });

  it("cannot delete a nested document and take it off the post's count", async () => {
    const db = useMemoryFirestore(seed());
    const writer = vi.spyOn(spacePostEngagement, "deleteSpacePostComment");
    await expect(
      deleteSpacePostCommentCallable.run(
        { spaceId: "runners", postId: "P", commentId: "C/comments/N" },
        VERIFIED
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(writer).not.toHaveBeenCalled();
    expect(db.operations).toEqual([]);
    expect(db.data.get("spaces/runners/posts/P").commentCount).toBe(1);
    expect(db.data.has("spaces/runners/posts/P/comments/C/comments/N")).toBe(
      true
    );
  });

  it("still comments on and deletes from a real post", async () => {
    const db = useMemoryFirestore(seed());
    const { commentId } = await addSpacePostCommentCallable.run(
      { spaceId: "runners", postId: "P", text: "Strong finish" },
      VERIFIED
    );
    expect(db.data.has(`spaces/runners/posts/P/comments/${commentId}`)).toBe(
      true
    );
    await deleteSpacePostCommentCallable.run(
      { spaceId: "runners", postId: "P", commentId },
      VERIFIED
    );
    expect(db.data.has(`spaces/runners/posts/P/comments/${commentId}`)).toBe(
      false
    );
  });
});

describe.each([
  [
    "addSpacePostCommentCallable",
    addSpacePostCommentCallable,
    [{ spaceId: "runners", postId: "P/likes/x", text: "x" }],
    () => vi.spyOn(spacePostEngagement, "addSpacePostComment"),
  ],
  [
    "deleteSpacePostCommentCallable",
    deleteSpacePostCommentCallable,
    [
      { spaceId: "runners", postId: "P/comments/C", commentId: "N" },
      { spaceId: "runners", postId: "P", commentId: "C/comments/N" },
      { spaceId: "runners", postId: "P", commentId: ".." },
    ],
    () => vi.spyOn(spacePostEngagement, "deleteSpacePostComment"),
  ],
  [
    "addCommentCallable",
    addCommentCallable,
    [{ activityId: "a/comments/b", text: "x" }],
    () => vi.spyOn(socialCounters, "addComment"),
  ],
  [
    "deleteCommentCallable",
    deleteCommentCallable,
    [
      { activityId: "a/b/c", commentId: "c1" },
      { activityId: "a", commentId: "c1/x/y" },
      { activityId: "a", commentId: "__c1__" },
    ],
    () => vi.spyOn(socialCounters, "deleteComment"),
  ],
])("%s — an id with a path in it", (_name, callable, requests, spyWriter) => {
  it("is refused as invalid-argument, and nothing is read or written", async () => {
    for (const request of requests) {
      const db = useMemoryFirestore();
      const writer = spyWriter();
      await expect(callable.run(request, VERIFIED)).rejects.toMatchObject({
        code: "invalid-argument",
      });
      expect(writer).not.toHaveBeenCalled();
      expect(limiter).not.toHaveBeenCalled();
      expect(db.operations).toEqual([]);
    }
  });
});

describe("the admin and maintenance callables", () => {
  it("resolveReport refuses a reportId that cannot name a document", async () => {
    vi.stubEnv("ADMIN_UIDS", "admin-1");
    const db = useMemoryFirestore({ "reports/__r1__": { status: "pending" } });
    await expect(
      resolveReport.run({ reportId: "__r1__" }, ADMIN)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.operations).toEqual([]);
  });

  it("liftRestriction refuses a uid that cannot name a document", async () => {
    vi.stubEnv("ADMIN_UIDS", "admin-1");
    const db = useMemoryFirestore({ "globalRestrictedUids/__u__": {} });
    await expect(
      liftRestriction.run({ uid: "__u__" }, ADMIN)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.operations).toEqual([]);
  });

  it("recreditMyLiftVolume refuses a cursor that cannot name a document", async () => {
    const db = useMemoryFirestore();
    await expect(
      recreditMyLiftVolume.run({ startAfter: "__w__" }, { auth: { uid: ME } })
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(limiter).not.toHaveBeenCalled();
    expect(db.operations).toEqual([]);
  });

  it("a report's target id is held to the same check", () => {
    expect(() =>
      reportTargets.normalizeCreateReportInput({
        targetType: "activity",
        targetId: "__a1__",
        category: "spam",
      })
    ).toThrow();
  });
});

describe("the Circle callables' ids", () => {
  const NOW = 1_000;
  const circle = () =>
    memoryFirestore({
      "goalSpaces/S": {
        ownerId: "owner",
        active: true,
        memberCount: 2,
        maxMembers: 8,
        inviteCode: "CODE2345",
        inviteCodeExpiresAt: NOW + 1_000_000,
        createdAt: NOW,
      },
      "goalSpaces/S/members/owner": { uid: "owner", role: "owner" },
      "goalSpaces/S/members/m1": { uid: "m1", role: "member" },
      "goalSpaces/S/events/E": { uid: "m1", kind: "weekly_check_in" },
    });

  const refusals = [
    [
      "join, with a spaceId",
      (firestore) =>
        goalSpaceMembership.joinGoalSpace({
          firestore,
          uid: "m2",
          displayName: "New",
          photoURL: null,
          spaceId: "S/events/E",
          inviteCode: "CODE2345",
          now: NOW,
          makeId: () => "x",
        }),
    ],
    [
      "join, with the spaceId.token form",
      (firestore) =>
        goalSpaceMembership.joinGoalSpace({
          firestore,
          uid: "m2",
          displayName: "New",
          photoURL: null,
          code: "S/events/E.CODE2345",
          now: NOW,
          makeId: () => "x",
        }),
    ],
    [
      "renew",
      (firestore) =>
        goalSpaceMembership.renewGoalSpaceInviteCode({
          firestore,
          uid: "owner",
          spaceId: "S/events/E",
          now: NOW,
          makeCode: () => "NEWC2345",
        }),
    ],
    [
      "leave",
      (firestore) =>
        goalSpaceMembership.leaveGoalSpace({
          firestore,
          uid: "m1",
          spaceId: "S/events/E",
        }),
    ],
    [
      "remove, with a spaceId",
      (firestore) =>
        goalSpaceMembership.removeGoalSpaceMember({
          firestore,
          uid: "owner",
          spaceId: "S/events/E",
          memberUid: "m1",
        }),
    ],
    [
      "remove, with a memberUid",
      (firestore) =>
        goalSpaceMembership.removeGoalSpaceMember({
          firestore,
          uid: "owner",
          spaceId: "S",
          memberUid: "m1/journeys/S",
        }),
    ],
    [
      "check in",
      (firestore) =>
        goalSpaceCheckIn.weeklyCheckIn({
          firestore,
          uid: "m1",
          spaceId: "S/events/E",
          weekKey: "2026-10-26",
          weeklyFocus: null,
          now: Date.UTC(2026, 9, 28),
        }),
    ],
    [
      "back a check-in, with a spaceId",
      (firestore) =>
        goalSpaceCheckIn.backWeeklyCheckIn({
          firestore,
          uid: "owner",
          spaceId: "S/events/E",
          eventId: "E",
        }),
    ],
    [
      "back a check-in, with an eventId",
      (firestore) =>
        goalSpaceCheckIn.backWeeklyCheckIn({
          firestore,
          uid: "owner",
          spaceId: "S",
          eventId: "E/x/y",
        }),
    ],
    [
      "resolve the target",
      (firestore) =>
        goalSpaceLifecycle.resolveTarget({
          firestore,
          uid: "owner",
          spaceId: "S/events/E",
          action: "wrap",
          now: NOW,
        }),
    ],
  ];

  it.each(refusals)(
    "%s: is refused as invalid-argument, and nothing is read or written",
    async (_name, call) => {
      const firestore = circle();
      const err = await call(firestore).catch((e) => e);
      expect(err).toBeInstanceOf(goalSpaceMembership.GoalSpaceError);
      expect(err.code).toBe("invalid-argument");
      expect(firestore.operations).toEqual([]);
    }
  );

  it("a partner streak refuses a partner id that cannot name a document", async () => {
    const firestore = memoryFirestore();
    for (const partnerUid of [".", "..", "a/b", "__u__"]) {
      const err = await partnerBonds
        .startPartnerBond({ firestore, uid: "me", partnerUid, createdAt: 1 })
        .catch((e) => e);
      expect(err).toBeInstanceOf(partnerBonds.PartnerBondError);
      expect(err.code).toBe("invalid-argument");
    }
    expect(firestore.operations).toEqual([]);
  });
});

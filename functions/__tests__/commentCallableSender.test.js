/**
 * The two comment-writing callables, driven through `.run(data, context)`:
 *
 *   - the name on the stored comment and in the author's notification is
 *     the commenter's public profile name, resolved on the server, never
 *     the `authorName` the request carries;
 *   - a failure inside the write reaches the app as a sentence for the
 *     person or a generic `internal`, never as the engine's diagnostic
 *     under failed-precondition (which the app prints in its toast).
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
const {
  addCommentCallable,
  addSpacePostCommentCallable,
  deleteCommentCallable,
  deleteSpacePostCommentCallable,
} = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const realAssertNotRestricted = restriction.assertNotRestricted;

const COMMENTER = "commenter-1";
const VERIFIED = { auth: { uid: COMMENTER, token: { email_verified: true } } };

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

beforeEach(() => {
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
  restriction.assertNotRestricted = async () => {};
  rateLimiter.isRateLimited = async () => false;
});

afterEach(() => {
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  restriction.assertNotRestricted = realAssertNotRestricted;
  vi.restoreAllMocks();
});

const ADDERS = [
  [
    "addCommentCallable",
    addCommentCallable,
    { activityId: "act-1" },
    () =>
      vi
        .spyOn(socialCounters, "addComment")
        .mockResolvedValue({ commentId: "c1", activityAuthorId: "author-1" }),
    "comment",
  ],
  [
    "addSpacePostCommentCallable",
    addSpacePostCommentCallable,
    { spaceId: "runners", postId: "post-1" },
    () =>
      vi
        .spyOn(spacePostEngagement, "addSpacePostComment")
        .mockResolvedValue({ commentId: "c1", postAuthorId: "author-1" }),
    "space_post_comment",
  ],
];

describe.each(ADDERS)(
  "%s — the commenter's name",
  (_name, callable, ids, spyWriter, type) => {
    it("stores and notifies with the public profile name, not the request's", async () => {
      useMemoryFirestore({
        [`users/${COMMENTER}/public/profile`]: { displayName: "Real Name" },
      });
      const writer = spyWriter();
      const notify = vi
        .spyOn(socialFanout, "createNotification")
        .mockResolvedValue(undefined);
      await callable.run(
        { ...ids, text: "Strong finish", authorName: "Coach Tropos" },
        VERIFIED
      );
      expect(writer.mock.calls[0][0].authorName).toBe("Real Name");
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0].data).toMatchObject({
        type,
        fromName: "Real Name",
        message: expect.stringMatching(/^Real Name commented on your /),
      });
    });

    it("falls back to Someone with no public profile, ignoring the request's name", async () => {
      useMemoryFirestore();
      const writer = spyWriter();
      const notify = vi
        .spyOn(socialFanout, "createNotification")
        .mockResolvedValue(undefined);
      await callable.run(
        { ...ids, text: "Strong finish", authorName: "Coach Tropos" },
        VERIFIED
      );
      expect(writer.mock.calls[0][0].authorName).toBe("Someone");
      expect(notify.mock.calls[0][0].data.fromName).toBe("Someone");
    });
  }
);

describe.each(ADDERS)(
  "%s — a failed write",
  (_name, callable, ids, spyWriter) => {
    it("hides an unexpected engine error behind a generic internal", async () => {
      useMemoryFirestore();
      spyWriter().mockRejectedValue(
        new Error("addComment: firestore, uid, activityId required")
      );
      await expect(
        callable.run({ ...ids, text: "Strong finish" }, VERIFIED)
      ).rejects.toMatchObject({
        code: "internal",
        message: "Something went wrong.",
      });
    });
  }
);

describe.each([
  [
    "deleteCommentCallable",
    deleteCommentCallable,
    { activityId: "act-1", commentId: "abc123" },
    () => vi.spyOn(socialCounters, "deleteComment"),
    "deleteComment",
  ],
  [
    "deleteSpacePostCommentCallable",
    deleteSpacePostCommentCallable,
    { spaceId: "runners", postId: "post-1", commentId: "abc123" },
    () => vi.spyOn(spacePostEngagement, "deleteSpacePostComment"),
    "deleteSpacePostComment",
  ],
])("%s — a failed delete", (_name, callable, ids, spyWriter, prefix) => {
  it("says a missing comment in words, not its id", async () => {
    useMemoryFirestore();
    spyWriter().mockRejectedValue(
      new Error(`${prefix}: comment abc123 not found`)
    );
    const err = await callable.run(ids, VERIFIED).catch((e) => e);
    expect(err).toMatchObject({
      code: "failed-precondition",
      message: "This comment has already been deleted.",
    });
    expect(err.message).not.toMatch(/abc123/);
  });

  it("refuses someone else's comment in words the app shows", async () => {
    useMemoryFirestore();
    spyWriter().mockRejectedValue(new Error(`${prefix}: not authorized`));
    await expect(callable.run(ids, VERIFIED)).rejects.toMatchObject({
      code: "failed-precondition",
      message: "You can only delete your own comments.",
    });
  });

  it("hides an unexpected error behind a generic internal", async () => {
    useMemoryFirestore();
    spyWriter().mockRejectedValue(new Error("DEADLINE_EXCEEDED on txn 9f2"));
    await expect(callable.run(ids, VERIFIED)).rejects.toMatchObject({
      code: "internal",
      message: "Something went wrong.",
    });
  });
});

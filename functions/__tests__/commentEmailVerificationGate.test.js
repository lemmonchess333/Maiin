/**
 * Comment callables refuse an unverified email before touching Firestore.
 *
 * Comments are public content with a single writer — the callable — so the
 * rules' isEmailVerified() gate on activity and space-post creates cannot
 * see them; `addCommentCallable` and `addSpacePostCommentCallable` check
 * the same `email_verified` claim themselves. Two properties are pinned:
 *
 *   - An unverified (or claim-less) caller is refused with
 *     `failed-precondition` and the user-facing line, and NOTHING else
 *     happens: no Firestore read or write, no notification. The check sits
 *     ahead of the deletion lock, the rate limiter and the block guard, so
 *     refusal is free and none of those layers can be probed.
 *   - A verified caller is let through. The gate reads the claim, not the
 *     provider — an OAuth token and a verified password account look the
 *     same to it. Driven against the emulator, because "let through" means
 *     the comment actually lands.
 *
 * `onCall` exposes `.run(data, context)` for direct invocation. The refusal
 * cases need no emulator (they never reach an RPC); the pass-through suite
 * is gated on FIRESTORE_EMULATOR_HOST like the other integration suites.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { addCommentCallable, addSpacePostCommentCallable } = require("../index");
const admin = require("firebase-admin");
const socialFanout = require("../lib/socialFanout");
const socialCounters = require("../lib/socialCounters");
const spacePostEngagement = require("../lib/spacePostEngagement");
const accountDeletionLocks = require("../lib/accountDeletionLocks");

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const integration = EMULATOR_HOST ? describe : describe.skip;

const UID = "commenter-uid";
const AUTHOR = "author-uid";
const COMMENT_ARGS = {
  activityId: "act-1",
  text: "Nice run",
  authorName: "Sam",
};
const SPACE_COMMENT_ARGS = {
  spaceId: "runners",
  postId: "post-1",
  text: "Nice one",
  authorName: "Sam",
};
const REFUSAL = {
  code: "failed-precondition",
  message: "Verify your email to comment.",
};

/** Contexts that must be refused: claim false, claim absent, no token. */
const UNVERIFIED_CONTEXTS = [
  [
    "email_verified false",
    { auth: { uid: UID, token: { email_verified: false } } },
  ],
  ["claim absent", { auth: { uid: UID, token: {} } }],
  ["no token object", { auth: { uid: UID } }],
];

/** Everything a call that got PAST the gate would have to touch. The
 *  deletion lock is the first Firestore read in both callables; the two
 *  lib writers and the notification are the side effects. */
function spyOnEverythingPastTheGate() {
  return {
    deletionLock: vi
      .spyOn(accountDeletionLocks, "assertCallableActorNotDeleting")
      .mockResolvedValue(undefined),
    addComment: vi.spyOn(socialCounters, "addComment"),
    addSpaceComment: vi.spyOn(spacePostEngagement, "addSpacePostComment"),
    notify: vi.spyOn(socialFanout, "createNotification"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("addCommentCallable — email verification gate", () => {
  it.each(UNVERIFIED_CONTEXTS)(
    "refuses with failed-precondition and touches nothing (%s)",
    async (_label, context) => {
      const spies = spyOnEverythingPastTheGate();
      await expect(
        addCommentCallable.run(COMMENT_ARGS, context)
      ).rejects.toMatchObject(REFUSAL);
      expect(spies.deletionLock).not.toHaveBeenCalled();
      expect(spies.addComment).not.toHaveBeenCalled();
      expect(spies.notify).not.toHaveBeenCalled();
    }
  );

  it("still puts authentication first — no auth is 'unauthenticated', not the verification line", async () => {
    await expect(
      addCommentCallable.run(COMMENT_ARGS, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("addSpacePostCommentCallable — email verification gate", () => {
  it.each(UNVERIFIED_CONTEXTS)(
    "refuses with failed-precondition and touches nothing (%s)",
    async (_label, context) => {
      const spies = spyOnEverythingPastTheGate();
      await expect(
        addSpacePostCommentCallable.run(SPACE_COMMENT_ARGS, context)
      ).rejects.toMatchObject(REFUSAL);
      expect(spies.deletionLock).not.toHaveBeenCalled();
      expect(spies.addSpaceComment).not.toHaveBeenCalled();
      expect(spies.notify).not.toHaveBeenCalled();
    }
  );

  it("still puts authentication first — no auth is 'unauthenticated', not the verification line", async () => {
    await expect(
      addSpacePostCommentCallable.run(SPACE_COMMENT_ARGS, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

integration("verified callers are let through (emulator)", () => {
  let db;
  const VERIFIED = { auth: { uid: UID, token: { email_verified: true } } };

  beforeAll(() => {
    db = admin.firestore();
  });

  it("addCommentCallable lands the comment and bumps commentCount", async () => {
    const activityId = `gate-act-${Date.now()}`;
    await db.collection("activities").doc(activityId).set({
      authorId: AUTHOR,
      authorName: "Author",
      type: "run",
      visibility: "public",
      kudosCount: 0,
      commentCount: 0,
      createdAt: new Date(),
    });

    const result = await addCommentCallable.run(
      { ...COMMENT_ARGS, activityId },
      VERIFIED
    );

    expect(result.commentId).toBeTruthy();
    const comment = await db
      .collection("comments")
      .doc(activityId)
      .collection("items")
      .doc(result.commentId)
      .get();
    expect(comment.exists).toBe(true);
    expect(comment.data().authorId).toBe(UID);
    const activity = await db.collection("activities").doc(activityId).get();
    expect(activity.data().commentCount).toBe(1);
  });

  it("addSpacePostCommentCallable lands the comment and bumps commentCount", async () => {
    const postId = `gate-post-${Date.now()}`;
    const postRef = db
      .collection("spaces")
      .doc(SPACE_COMMENT_ARGS.spaceId)
      .collection("posts")
      .doc(postId);
    await postRef.set({
      authorId: AUTHOR,
      authorName: "Author",
      body: "First run of the block done.",
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date(),
    });

    const result = await addSpacePostCommentCallable.run(
      { ...SPACE_COMMENT_ARGS, postId },
      VERIFIED
    );

    expect(result.commentId).toBeTruthy();
    const comment = await postRef
      .collection("comments")
      .doc(result.commentId)
      .get();
    expect(comment.exists).toBe(true);
    expect(comment.data().authorId).toBe(UID);
    expect((await postRef.get()).data().commentCount).toBe(1);
  });
});

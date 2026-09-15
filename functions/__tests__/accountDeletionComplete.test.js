import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { deleteAccount } = require("../accountDeletion");
const { cleanupSocial } = require("../lib/accountDeletionSocial");
const {
  retryBilling,
  resumeDeletions,
} = require("../lib/accountDeletionRetry");
const now = Date.UTC(2026, 8, 15);
const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

function setup(extra = {}) {
  const firestore = memoryFirestore({
    "users/alice": { displayName: "Alice" },
    "users/alice/meals/lunch": { name: "Meal" },
    "users/alice/_engine/old/receipts/nested": { marker: true },
    "users/bob/meals/lunch": { name: "Bob's meal" },
    "activities/own": { authorId: "alice" },
    "activities/other": { authorId: "bob", kudosCount: 2, commentCount: 1 },
    "comments/own/items/bobs-reply": { authorId: "bob", text: "Reply" },
    "kudos/own/users/bob": { createdAt: now },
    "kudos/other/users/alice": { createdAt: now },
    "kudos/other/users/carol": { createdAt: now },
    "comments/other/items/comment": {
      authorId: "alice",
      authorName: "Alice",
      authorPhotoURL: "photo",
      text: "Private original",
      createdAt: now,
    },
    "comments/other/items/bobs-comment": {
      authorId: "bob",
      text: "Keep me",
      reactions: { fire: ["alice", "carol"] },
    },
    "feeds/former-follower/items/own": {
      authorId: "alice",
      authorName: "Alice",
    },
    "feeds/bob/items/other": { authorId: "carol" },
    "notifications/bob/items/from-alice": { fromUserId: "alice" },
    "followers/alice/users/bob": { followedAt: now },
    "following/bob/users/alice": { followedAt: now },
    "followers/bob/users/alice": { followedAt: now },
    "blocks/carol/users/alice": { blockedAt: now },
    "spaces/running/posts/bobs-post": { authorId: "bob", likeCount: 2 },
    "spaces/running/posts/bobs-post/likes/alice": { createdAt: now },
    "spaces/running/posts/bobs-post/likes/carol": { createdAt: now },
    "spaces/running/posts/bobs-post/comments/reply": {
      authorId: "alice",
      text: "Space original",
    },
    "goalSpaces/old/events/event": { uid: "alice", displayName: "Alice" },
    "goalSpaces/old/events/backed": {
      uid: "bob",
      supporterIds: ["alice", "carol"],
    },
    "goalSpaces/owned": {
      ownerId: "alice",
      title: "Alice's circle",
      memberCount: 2,
      inviteCode: "join",
      active: true,
    },
    "goalSpaces/owned/members/alice": { uid: "alice" },
    "goalSpaces/owned/members/bob": { uid: "bob" },
    "goalSpaceInvites/join": { spaceId: "owned" },
    "reports/report": {
      reporterId: "bob",
      targetUid: "alice",
      targetId: "own",
      freeformNote: "Identity in evidence",
      category: "spam",
      status: "pending",
    },
    "reportAuthority/report": { targetUid: "alice" },
    "reports/by-alice": {
      reporterId: "alice",
      targetUid: "carol",
      targetId: "other",
      targetType: "activity",
      category: "spam",
      status: "pending",
      freeformNote: "Alice's note",
    },
    "reportAuthority/by-alice": { targetUid: "carol" },
    "groups/legacy": { memberCount: 2 },
    "groups/legacy/members/alice": { name: "Alice" },
    "spaces/retired-room/members/alice": { joinedAt: now },
    "challenges/missing-parent/participants/alice": { name: "Alice" },
    "spaces/retired-room/posts/own": { authorId: "alice" },
    "spaces/retired-room/posts/own/comments/bob": {
      authorId: "bob",
      text: "reply",
    },
    "spaces/retired-room/posts/own/likes/bob": { createdAt: now },
    "globalRestrictedUids/alice": { uid: "alice" },
    "rateLimits/alice_scan": { recent: [1] },
    "rateLimits/alice2_scan": { recent: [1] },
    "rateLimits/verifyemail_alice_verificationEmail": { recent: [1] },
    ...extra,
  });
  return {
    firestore,
    auth: { deleteUser: vi.fn().mockResolvedValue(undefined) },
    storageBucket: { deleteFiles: vi.fn().mockResolvedValue(undefined) },
    uid: "alice",
    logger,
    now,
  };
}

// Execution-backed inventory coverage: each target is seeded above and its
// actual absence (plus surviving-account data/counters) is asserted below.
// smoke::topLevelOwn::globalRestrictedUids
// smoke::topLevelOwn::rateLimits
// smoke::activitiesOwnKudos
// smoke::activitiesOwnComments
// smoke::notificationsFromMe
// unit::accountDeletion.feedFanout
// smoke::followMirrors::followers
// smoke::followMirrors::following
// smoke::blocksReverse
// smoke::crewMemberships
// smoke::kudosByMe
describe("complete account erasure", () => {
  it("removes nested personal data and cross-user copies, preserving other accounts and bounded private evidence", async () => {
    const ctx = setup();
    await deleteAccount(ctx);
    const { data } = ctx.firestore;
    for (const path of [
      "users/alice",
      "users/alice/_engine/old/receipts/nested",
      "activities/own",
      "comments/own/items/bobs-reply",
      "kudos/own/users/bob",
      "kudos/other/users/alice",
      "feeds/former-follower/items/own",
      "following/bob/users/alice",
      "followers/bob/users/alice",
      "blocks/carol/users/alice",
      "notifications/bob/items/from-alice",
      "spaces/running/posts/bobs-post/likes/alice",
      "goalSpaces/old/events/event",
      "goalSpaceInvites/join",
      "reportAuthority/report",
      "rateLimits/alice_scan",
      "rateLimits/verifyemail_alice_verificationEmail",
      "globalRestrictedUids/alice",
      "groups/legacy/members/alice",
      "spaces/retired-room/members/alice",
      "challenges/missing-parent/participants/alice",
      "spaces/retired-room/posts/own/comments/bob",
      "spaces/retired-room/posts/own/likes/bob",
    ])
      expect(data.has(path), path).toBe(false);
    expect(data.get("users/bob/meals/lunch")).toEqual({ name: "Bob's meal" });
    expect(data.get("activities/other")).toMatchObject({
      kudosCount: 1,
      commentCount: 1,
    });
    expect(data.get("spaces/running/posts/bobs-post").likeCount).toBe(1);
    expect(data.get("comments/other/items/comment")).toMatchObject({
      authorId: null,
      authorName: "Deleted user",
      text: "Comment deleted",
    });
    expect(
      data.get("comments/other/items/bobs-comment").reactions.fire
    ).toEqual(["carol"]);
    expect(data.get("goalSpaces/old/events/backed").supporterIds).toEqual([
      "carol",
    ]);
    expect(data.get("goalSpaces/owned")).toMatchObject({
      ownerId: null,
      memberCount: 1,
      active: false,
    });
    expect(data.has("goalSpaces/owned/members/bob")).toBe(true);
    expect(data.has("rateLimits/alice2_scan")).toBe(true);
    const evidence = [...data].filter(([path]) =>
      path.startsWith("deletedCommentEvidence/")
    );
    expect(evidence).toHaveLength(2);
    expect(evidence[0][1].expiresAt).toBeInstanceOf(Date);
    expect(
      [...data]
        .filter(([path]) => !path.startsWith("deletedCommentEvidence/"))
        .some(([, value]) => JSON.stringify(value).includes("Private original"))
    ).toBe(false);
    expect(data.get("reports/by-alice")).toMatchObject({
      reporterId: null,
      targetUid: "carol",
      status: "pending",
    });
    expect(data.has("reportAuthority/by-alice")).toBe(true);
    expect(data.get("groups/legacy").memberCount).toBe(1);
    expect(data.get("reports/report")).not.toHaveProperty("targetUid");
    expect(data.get("reports/report").expiresAt).toBeInstanceOf(Date);
    expect(data.get("accountDeletionRequests/alice")).toMatchObject({
      status: "completed",
      resumeVersion: 2,
      nextAttemptAt: null,
    });
    expect(
      data.get("accountDeletionRequests/alice").cleanupAfter
    ).toBeInstanceOf(Date);
    expect(ctx.auth.deleteUser).toHaveBeenCalledOnce();
  });

  it.each([
    "query:items",
    `delete:spaces/${require("../lib/spaceIds").SPACE_IDS[0]}/members/alice`,
    "recursiveDelete:users/alice",
    "set:deletedAccounts/alice",
  ])("keeps Auth and retries after %s fails", async (failure) => {
    const ctx = setup();
    ctx.firestore.failures.set(failure, new Error("outage"));
    await expect(deleteAccount(ctx)).rejects.toThrow("outage");
    expect(ctx.auth.deleteUser).not.toHaveBeenCalled();
    expect(ctx.firestore.data.get("accountDeletionRequests/alice").status).toBe(
      "failed_cleanup"
    );
    ctx.firestore.failures.clear();
    await deleteAccount({ ...ctx, now: now + 1000 });
    expect(ctx.auth.deleteUser).toHaveBeenCalledOnce();
    expect(ctx.firestore.data.get("activities/other").kudosCount).toBe(1);
  });

  it("retains the Stripe cancellation task through provider failure and removes it after retry", async () => {
    const ctx = setup({ "users/alice": { stripeSubscriptionId: "sub_test" } });
    await deleteAccount({
      ...ctx,
      cancelStripeSubscription: vi
        .fn()
        .mockRejectedValue(new Error("Stripe unavailable")),
    });
    expect(ctx.auth.deleteUser).toHaveBeenCalledOnce();
    expect(
      ctx.firestore.data.get("accountDeletionBilling/alice")
        .stripeSubscriptionId
    ).toBe("sub_test");
    const cancel = vi.fn().mockResolvedValue(undefined);
    await retryBilling({
      firestore: ctx.firestore,
      logger,
      now: now + 86400000,
      cancel,
    });
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_test" })
    );
    expect(ctx.firestore.data.has("accountDeletionBilling/alice")).toBe(false);
  });

  it("cannot lose the cancellation ID if its durable task write fails", async () => {
    const ctx = setup({ "users/alice": { stripeSubscriptionId: "sub_test" } });
    ctx.firestore.failures.set(
      "set:accountDeletionBilling/alice",
      new Error("outage")
    );
    await expect(deleteAccount(ctx)).rejects.toThrow("outage");
    expect(ctx.firestore.data.has("users/alice")).toBe(true);
    expect(ctx.auth.deleteUser).not.toHaveBeenCalled();
  });

  it("recovers a lost completion write after Auth has already been deleted", async () => {
    const ctx = setup();
    ctx.auth.deleteUser.mockImplementationOnce(async () => {
      ctx.firestore.failures.set(
        "set:accountDeletionRequests/alice",
        new Error("ledger outage")
      );
    });
    await expect(deleteAccount(ctx)).rejects.toThrow("ledger outage");
    ctx.firestore.failures.clear();
    ctx.auth.deleteUser.mockRejectedValueOnce(
      Object.assign(new Error("gone"), { code: "auth/user-not-found" })
    );
    await deleteAccount({ ...ctx, now: now + 600000 });
    expect(ctx.firestore.data.get("accountDeletionRequests/alice").status).toBe(
      "completed"
    );
  });

  it("resumes paged legacy edges after an interruption without decrementing twice", async () => {
    const ctx = setup();
    for (let n = 0; n < 310; n++)
      ctx.firestore.data.set(
        `kudos/zz-${String(n).padStart(3, "0")}/users/bob`,
        {}
      );
    let checks = 0;
    await expect(
      cleanupSocial({
        ...ctx,
        checkpoint: async () => {
          if (++checks === 180) throw new Error("yield");
        },
      })
    ).rejects.toThrow("yield");
    expect(
      ctx.firestore.data.get("accountDeletionWork/alice").legacy_users.cursor
    ).toBeTruthy();
    await cleanupSocial({ ...ctx, checkpoint: async () => {} });
    expect(ctx.firestore.data.get("activities/other").kudosCount).toBe(1);
    expect(
      ctx.firestore.data.get("accountDeletionWork/alice").legacy_users.done
    ).toBe(true);
  });

  it("delayed social writers cannot recreate data after either account freezes", async () => {
    const {
      fanoutActivityToFeeds,
      createNotification,
    } = require("../lib/socialFanout");
    for (const deletingUid of ["alice", "bob"]) {
      const firestore = memoryFirestore({
        "followers/alice/users/bob": {},
        [`accountDeletionRequests/${deletingUid}`]: { status: "running" },
      });
      await fanoutActivityToFeeds({
        firestore,
        activityId: "late",
        authorId: "alice",
        activityData: {
          authorName: "Alice",
          type: "run",
          visibility: "public",
        },
        serverTimestamp: () => now,
      });
      const result = await createNotification({
        firestore,
        fromUid: "alice",
        toUid: "bob",
        data: { type: "follow", fromName: "Alice" },
        notificationId: "late",
        serverTimestamp: () => now,
      });
      expect(firestore.data.has("feeds/bob/items/late")).toBe(false);
      expect(firestore.data.has("notifications/bob/items/late")).toBe(false);
      expect(result).toMatchObject({ skipped: true, deleting: true });
    }
  });

  it("worker resumes only the new authorised requests, never completed or historical operations", async () => {
    const firestore = memoryFirestore({
      "accountDeletionRequests/active": {
        resumeVersion: 2,
        status: "failed_cleanup",
        nextAttemptAt: new Date(now),
      },
      "accountDeletionRequests/old": {
        status: "failed_cleanup",
        nextAttemptAt: new Date(now),
      },
      "accountDeletionRequests/done": {
        resumeVersion: 2,
        status: "completed",
        nextAttemptAt: new Date(now),
      },
    });
    const execute = vi.fn().mockResolvedValue(undefined);
    await resumeDeletions({ firestore, deleteAccount: execute, logger, now });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "active" })
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    // Polish3: who blocked whom, the server-written copy. Carol blocked
    // Alice (a row under Alice), Alice blocked Dave (a row naming Alice
    // under Dave), and Carol blocked Bob, which is not Alice's.
    "blocks/alice/users/dave": { blockedAt: now },
    "blockedBy/alice/users/carol": {},
    "blockedBy/dave/users/alice": {},
    "blockedBy/bob/users/carol": {},
    // Polish2: a request to Alice, one she sent, and one between others.
    "followRequests/alice/users/bob": { requestedAt: now },
    "followRequests/carol/users/alice": { requestedAt: now },
    "followRequests/carol/users/bob": { requestedAt: now },
    // Polish2: the week on followers' boards, Alice's and Bob's.
    "friendsBoard/alice": { sessions: 3 },
    "friendsBoard/bob": { sessions: 1 },
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
    "challenges/missing-parent/participants/alice/applied/run-1": {
      sourceId: "run-1",
    },
    "challenges/weekly": { title: "This week" },
    "challenges/weekly/participants/alice": { currentValue: 1 },
    "challenges/weekly/participants/alice/applied/run-2": { sourceId: "run-2" },
    // A challenge Alice left: the markers stay, by design, with no
    // participant doc above them.
    "challenges/left/participants/alice/applied/run-3": { sourceId: "run-3" },
    "challenges/left": { title: "Left" },
    "challenges/weekly/participants/bob/applied/run-4": { sourceId: "run-4" },
    "appleNotifications/n-alice": {
      type: "DID_RENEW",
      originalTransactionId: "otx-alice",
      uid: "alice",
    },
    "appleNotifications/n-bob": { type: "DID_RENEW", uid: "bob" },
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
    "audit_checkout_sessions/alice-checkout": {
      uid: "alice",
      stripeSessionId: "cs_alice",
      priceId: "price_monthly",
    },
    "audit_checkout_sessions/bob-checkout": { uid: "bob" },
    "commentModeration/alice-comment": {
      action: "auto_delete",
      reason: "profanity",
      activityId: "other",
      commentId: "alice-comment",
      authorId: "alice",
      textRedacted: "Alice's ****",
      createdAt: now,
    },
    "commentModeration/bob-comment": {
      action: "auto_delete",
      authorId: "bob",
      textRedacted: "Bob's ****",
    },
    ...extra,
  });
  return {
    firestore,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        uid: "alice",
        email: "alice@example.com",
        emailVerified: true,
        providerData: [{ providerId: "google.com", uid: "alice-google" }],
      }),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    },
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
// smoke::topLevelQuery::checkoutAudit
// smoke::topLevelQuery::appleNotifications
// smoke::topLevelOwn::followRequests
// smoke::followRequests::sent
// smoke::topLevelOwn::friendsBoard
// smoke::topLevelOwn::blockedBy
// smoke::blockedByReverse
/* The billing tombstone's secret, which a restricted account's kept
   identities are hashed with. */
let priorSecret;
beforeEach(() => {
  priorSecret = process.env.BILLING_HMAC_SECRET;
  process.env.BILLING_HMAC_SECRET = "test-secret-0123456789abcdef";
});
afterEach(() => {
  if (priorSecret === undefined) delete process.env.BILLING_HMAC_SECRET;
  else process.env.BILLING_HMAC_SECRET = priorSecret;
});

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
      "blocks/alice/users/dave",
      "blockedBy/alice/users/carol",
      "blockedBy/dave/users/alice",
      "followRequests/alice/users/bob",
      "followRequests/carol/users/alice",
      "friendsBoard/alice",
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
      // Before 2026-10-20 neither the inventory nor the executor knew these.
      "audit_checkout_sessions/alice-checkout",
      "appleNotifications/n-alice",
      // Deletes do not cascade: these outlived the participant docs.
      "challenges/missing-parent/participants/alice/applied/run-1",
      "challenges/weekly/participants/alice",
      "challenges/weekly/participants/alice/applied/run-2",
      "challenges/left/participants/alice/applied/run-3",
    ])
      expect(data.has(path), path).toBe(false);
    for (const path of [
      "audit_checkout_sessions/bob-checkout",
      "appleNotifications/n-bob",
      "followRequests/carol/users/bob",
      "blockedBy/bob/users/carol",
      "friendsBoard/bob",
      "challenges/weekly/participants/bob/applied/run-4",
    ])
      expect(data.has(path), path).toBe(true);
    // The removal is still counted; who wrote it, and what, is not.
    expect(data.get("commentModeration/alice-comment")).toEqual({
      action: "auto_delete",
      reason: "profanity",
      activityId: "other",
      commentId: "alice-comment",
      createdAt: now,
      authorId: null,
    });
    expect(data.get("commentModeration/bob-comment").authorId).toBe("bob");
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
    // Alice was restricted, so her sign-in identities are kept, hashed,
    // for a new account to meet (S4e, STATUS 2026-10-20): nothing that
    // names her, and an expiry.
    const keptIdentities = [...data].filter(([path]) =>
      path.startsWith("restrictedIdentities/")
    );
    expect(keptIdentities).toHaveLength(2);
    for (const [, row] of keptIdentities) {
      expect(Object.keys(row).sort()).toEqual([
        "createdAt",
        "expiresAt",
        "reason",
      ]);
      expect(row.expiresAt).toBeInstanceOf(Date);
    }
    expect(JSON.stringify(keptIdentities)).not.toMatch(/alice/);
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

  it("takes a deleted account's name off the givers a post names, and its props off the count", async () => {
    const ctx = setup({
      "activities/other": {
        authorId: "bob",
        kudosCount: 2,
        commentCount: 1,
        recentPropsBy: [
          { uid: "alice", name: "Alice", photoURL: "photo" },
          { uid: "carol", name: "Carol" },
        ],
        recentPropsByUids: ["alice", "carol"],
      },
    });
    await cleanupSocial({ ...ctx, checkpoint: async () => {} });
    const post = ctx.firestore.data.get("activities/other");
    expect(post.recentPropsBy).toEqual([{ uid: "carol", name: "Carol" }]);
    expect(post.recentPropsByUids).toEqual(["carol"]);
    expect(post.kudosCount).toBe(1);
    expect(JSON.stringify(post)).not.toContain("Alice");
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
      // A kind that is on by default, so the deletion guard is what stops
      // it: "follow" is off until switched on, and would be skipped first.
      const result = await createNotification({
        firestore,
        fromUid: "alice",
        toUid: "bob",
        data: { type: "comment", fromName: "Alice" },
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

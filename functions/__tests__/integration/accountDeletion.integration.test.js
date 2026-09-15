import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
let db, deleteAccount, cleanupSocial, completeOnboarding;
const uid = "deletion-emulator-alice";
const now = Date.now();
const logger = { info() {}, warn() {}, error() {} };

suite("account deletion against Firestore", () => {
  beforeAll(() => {
    const index = require("../../index");
    db = require("firebase-admin").firestore();
    ({ deleteAccount } = require("../../accountDeletion"));
    ({ cleanupSocial } = require("../../lib/accountDeletionSocial"));
    completeOnboarding = index.completeOnboarding;
  });
  beforeEach(async () => {
    const project = db.projectId;
    const response = await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${project}/databases/(default)/documents`,
      { method: "DELETE" }
    );
    if (!response.ok)
      throw new Error("Could not reset the local Firestore emulator");
  });

  it("resumes collection-group paging and recursively erases data before removing login", async () => {
    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), { name: "Alice" });
    batch.set(db.doc(`users/${uid}/legacy/parent/nested/child`), {
      private: true,
    });
    batch.set(db.doc("activities/other"), { authorId: "bob", kudosCount: 2 });
    batch.set(db.doc(`kudos/other/users/${uid}`), { createdAt: now });
    batch.set(db.doc("kudos/other/users/carol"), { createdAt: now });
    batch.set(db.doc("comments/other/items/reply"), {
      authorId: uid,
      text: "private original",
      createdAt: now,
    });
    batch.set(db.doc("spaces/retired/posts/own"), { authorId: uid });
    batch.set(db.doc("spaces/retired/posts/own/likes/bob"), { createdAt: now });
    batch.set(db.doc("users/bob/meals/lunch"), { name: "Bob's meal" });
    for (let n = 0; n < 165; n++) {
      batch.set(
        db.doc(`feeds/former-${String(n).padStart(3, "0")}/items/own`),
        { authorId: uid }
      );
    }
    await batch.commit();

    let checks = 0;
    await expect(
      cleanupSocial({
        firestore: db,
        uid,
        now,
        checkpoint: async () => {
          if (++checks === 156) throw new Error("invocation interrupted");
        },
      })
    ).rejects.toThrow("invocation interrupted");
    const work = (await db.doc(`accountDeletionWork/${uid}`).get()).data();
    expect(work.items_authorId.cursor).toContain("feeds/");
    expect(
      (await db.collectionGroup("items").where("authorId", "==", uid).get())
        .size
    ).toBeGreaterThan(0);

    const auth = {
      deleteUser: vi.fn(async () => {
        expect(
          (await db.doc(`users/${uid}/legacy/parent/nested/child`).get()).exists
        ).toBe(false);
        expect(
          (await db.collectionGroup("items").where("authorId", "==", uid).get())
            .empty
        ).toBe(true);
        expect((await db.doc(`deletedAccounts/${uid}`).get()).exists).toBe(
          true
        );
      }),
    };
    await deleteAccount({
      firestore: db,
      uid,
      now,
      auth,
      storageBucket: { deleteFiles: vi.fn().mockResolvedValue(undefined) },
      logger,
    });
    expect(auth.deleteUser).toHaveBeenCalledOnce();
    expect((await db.doc("activities/other").get()).data().kudosCount).toBe(1);
    expect((await db.doc("kudos/other/users/carol").get()).exists).toBe(true);
    expect(
      (await db.doc("comments/other/items/reply").get()).data()
    ).toMatchObject({ authorId: null, text: "Comment deleted" });
    expect(
      (await db.doc("comments/other/items/reply").get()).data()
    ).not.toHaveProperty("originalText");
    expect(
      (await db.doc("spaces/retired/posts/own/likes/bob").get()).exists
    ).toBe(false);
    expect((await db.doc("users/bob/meals/lunch").get()).exists).toBe(true);
    const evidence = await db.collection("deletedCommentEvidence").get();
    expect(evidence.size).toBe(1);
    expect(evidence.docs[0].data().expiresAt.toMillis()).toBe(
      now + 365 * 86400000
    );
    expect(
      (await db.doc(`accountDeletionRequests/${uid}`).get()).data().status
    ).toBe("completed");
    expect((await db.doc(`accountDeletionWork/${uid}`).get()).exists).toBe(
      false
    );
  }, 120000);

  it("enforces email verification at the actual onboarding callable", async () => {
    const context = (provider, verified) => ({
      auth: {
        uid,
        token: {
          firebase: { sign_in_provider: provider },
          email_verified: verified,
        },
      },
    });
    await expect(
      completeOnboarding.run({}, context("password", false))
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "email-unverified" },
    });
    // These reach the normal payload validator, proving the email gate passed.
    await expect(
      completeOnboarding.run({}, context("password", true))
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      completeOnboarding.run({}, context("apple.com", true))
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);
  });

  it("cannot let completed or review-held requests fill the retry page", async () => {
    const { resumeDeletions } = require("../../lib/accountDeletionRetry");
    const batch = db.batch();
    for (let n = 0; n < 15; n++) batch.set(db.doc(`accountDeletionRequests/old-${n}`), { resumeVersion: 2, status: n % 2 ? "completed" : "operator_review", nextAttemptAt: new Date(now - 10000) });
    batch.set(db.doc(`accountDeletionRequests/${uid}`), { resumeVersion: 2, status: "failed_cleanup", nextAttemptAt: new Date(now - 1000) });
    await batch.commit();
    const execute = vi.fn().mockResolvedValue(undefined);
    await resumeDeletions({ firestore: db, deleteAccount: execute, logger, now });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ uid }));
  });
});

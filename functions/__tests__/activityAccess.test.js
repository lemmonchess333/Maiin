/**
 * Unit tests for assertCanInteractWithActivity (packet 13).
 *
 * The server-side visibility gate for kudos/comment/reaction callables. It
 * must mirror the Firestore Rules parent-read relation: public, owner, or
 * accepted follower — and reject everyone else with a single stable
 * `activity-not-accessible` code (callers map it to a generic
 * permission-denied, so the response never discloses existence/visibility).
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assertCanInteractWithActivity } = require("../lib/activityAccess");

/**
 * Transaction + firestore fake. `activity` is the parent doc (or null for a
 * missing parent); `followers` is a set of "authorId/uid" keys that exist.
 */
function makeCtx(activity, followers = new Set()) {
  const activityRef = { _kind: "activity" };
  const firestore = {
    collection: (name) => {
      expect(name).toBe("followers");
      return {
        doc: (authorId) => ({
          collection: (sub) => {
            expect(sub).toBe("users");
            return {
              doc: (uid) => ({ _kind: "follower", _key: `${authorId}/${uid}` }),
            };
          },
        }),
      };
    },
  };
  const tx = {
    get: vi.fn(async (ref) => {
      if (ref._kind === "activity") {
        return { exists: activity !== null, data: () => activity };
      }
      return { exists: followers.has(ref._key) };
    }),
  };
  return { tx, firestore, activityRef };
}

describe("assertCanInteractWithActivity", () => {
  it("allows any user on a PUBLIC activity", async () => {
    const { tx, firestore, activityRef } = makeCtx({
      visibility: "public",
      authorId: "bob",
    });
    const activity = await assertCanInteractWithActivity({
      tx,
      firestore,
      activityRef,
      uid: "stranger",
    });
    expect(activity.authorId).toBe("bob");
  });

  it("allows the OWNER on a private activity", async () => {
    const { tx, firestore, activityRef } = makeCtx({
      visibility: "private",
      authorId: "bob",
    });
    await expect(
      assertCanInteractWithActivity({ tx, firestore, activityRef, uid: "bob" })
    ).resolves.toMatchObject({ authorId: "bob" });
  });

  it("allows a FOLLOWER on a followers-only activity", async () => {
    const { tx, firestore, activityRef } = makeCtx(
      { visibility: "followers", authorId: "bob" },
      new Set(["bob/carol"])
    );
    await expect(
      assertCanInteractWithActivity({
        tx,
        firestore,
        activityRef,
        uid: "carol",
      })
    ).resolves.toMatchObject({ authorId: "bob" });
  });

  it("rejects a stranger on a private activity", async () => {
    const { tx, firestore, activityRef } = makeCtx({
      visibility: "private",
      authorId: "bob",
    });
    await expect(
      assertCanInteractWithActivity({
        tx,
        firestore,
        activityRef,
        uid: "mallory",
      })
    ).rejects.toMatchObject({ code: "activity-not-accessible" });
  });

  it("rejects a former follower (no follower doc) on a followers-only activity", async () => {
    const { tx, firestore, activityRef } = makeCtx(
      { visibility: "followers", authorId: "bob" },
      new Set() // unfollowed
    );
    await expect(
      assertCanInteractWithActivity({ tx, firestore, activityRef, uid: "dave" })
    ).rejects.toMatchObject({ code: "activity-not-accessible" });
  });

  it("rejects a non-owner on a followers-only activity with a missing authorId", async () => {
    const { tx, firestore, activityRef } = makeCtx({ visibility: "followers" });
    await expect(
      assertCanInteractWithActivity({ tx, firestore, activityRef, uid: "x" })
    ).rejects.toMatchObject({ code: "activity-not-accessible" });
  });

  it("rejects when the parent activity does not exist", async () => {
    const { tx, firestore, activityRef } = makeCtx(null);
    await expect(
      assertCanInteractWithActivity({ tx, firestore, activityRef, uid: "x" })
    ).rejects.toMatchObject({ code: "activity-not-accessible" });
  });
});

/**
 * Run27 call 11 — the owner renames a Circle (lib/goalSpaceMembership
 * renameGoalSpace, behind the renameGoalSpace callable).
 *
 * Pins: only the owner renames, only a live Circle, under the rule a new
 * Circle's name meets (trimmed, the word filter with the display name's
 * sentence); the name changes on the Circle, which every member reads, and
 * on each member's journey link, its one copy, without making a link that
 * is gone; and the callable refuses a restricted account before anything is
 * written, as it refuses one starting a Circle.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("../lib/adminSdk");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { REFUSALS } = require("../lib/objectionableText");
const {
  GoalSpaceError,
  createGoalSpace,
  renameGoalSpace,
} = require("../lib/goalSpaceMembership");
const index = require("../index");

function circle(extra = {}) {
  return {
    "goalSpaces/c1": {
      id: "c1",
      type: "race",
      title: "Spring half",
      ownerId: "owner",
      active: true,
      memberCount: 3,
    },
    "goalSpaces/c1/members/owner": { uid: "owner", role: "owner" },
    "goalSpaces/c1/members/maya": { uid: "maya", role: "member" },
    "goalSpaces/c1/members/sam": { uid: "sam", role: "member" },
    "users/owner/journeys/c1": { goalSpaceId: "c1", title: "Spring half" },
    "users/maya/journeys/c1": { goalSpaceId: "c1", title: "Spring half" },
    ...extra,
  };
}

async function refused(promise, code) {
  await expect(promise).rejects.toBeInstanceOf(GoalSpaceError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("renameGoalSpace", () => {
  it("renames the Circle and every member's link to it, and makes no link that is gone", async () => {
    const firestore = memoryFirestore(circle());
    const out = await renameGoalSpace({
      firestore,
      uid: "owner",
      spaceId: "c1",
      title: "  Autumn 10K  ",
    });
    expect(out).toEqual({ title: "Autumn 10K", changed: true });
    expect(firestore.data.get("goalSpaces/c1").title).toBe("Autumn 10K");
    expect(firestore.data.get("users/owner/journeys/c1").title).toBe(
      "Autumn 10K"
    );
    expect(firestore.data.get("users/maya/journeys/c1").title).toBe(
      "Autumn 10K"
    );
    // Sam's link was already gone (an account being deleted, say).
    expect(firestore.data.has("users/sam/journeys/c1")).toBe(false);
  });

  it("refuses anyone but the owner, and changes nothing", async () => {
    const firestore = memoryFirestore(circle());
    await refused(
      renameGoalSpace({ firestore, uid: "maya", spaceId: "c1", title: "Mine" }),
      "permission-denied"
    );
    await refused(
      renameGoalSpace({
        firestore,
        uid: "stranger",
        spaceId: "c1",
        title: "Mine",
      }),
      "permission-denied"
    );
    expect(firestore.data.get("goalSpaces/c1").title).toBe("Spring half");
  });

  it("refuses an ended Circle, a missing one and a bad id", async () => {
    await refused(
      renameGoalSpace({
        firestore: memoryFirestore(
          circle({
            "goalSpaces/c1": { ownerId: "owner", active: false, title: "x" },
          })
        ),
        uid: "owner",
        spaceId: "c1",
        title: "New",
      }),
      "failed-precondition"
    );
    await refused(
      renameGoalSpace({
        firestore: memoryFirestore(),
        uid: "owner",
        spaceId: "c1",
        title: "New",
      }),
      "not-found"
    );
    await refused(
      renameGoalSpace({
        firestore: memoryFirestore(circle()),
        uid: "owner",
        spaceId: "goalSpaces/c1",
        title: "New",
      }),
      "invalid-argument"
    );
  });

  it("holds the name to the rule a new Circle's meets: there, and passing the word filter", async () => {
    const firestore = memoryFirestore(circle());
    await refused(
      renameGoalSpace({ firestore, uid: "owner", spaceId: "c1", title: "  " }),
      "invalid-argument"
    );
    const rude = renameGoalSpace({
      firestore,
      uid: "owner",
      spaceId: "c1",
      title: "shit runners",
    });
    await expect(rude).rejects.toMatchObject({
      code: "invalid-argument",
      message: REFUSALS.displayName,
    });
    expect(firestore.data.get("goalSpaces/c1").title).toBe("Spring half");
    // The same name refused when a Circle is started.
    await expect(
      createGoalSpace({
        firestore,
        uid: "owner",
        input: { type: "race", title: "shit runners" },
        now: 1,
        makeId: () => "c2",
      })
    ).rejects.toMatchObject({ message: REFUSALS.displayName });
  });

  it("writes nothing when the name is the same", async () => {
    const firestore = memoryFirestore(circle());
    const before = firestore.operations.length;
    expect(
      await renameGoalSpace({
        firestore,
        uid: "owner",
        spaceId: "c1",
        title: "Spring half",
      })
    ).toEqual({ title: "Spring half", changed: false });
    expect(firestore.operations.length).toBe(before);
  });
});

describe("the renameGoalSpace callable", () => {
  const realIsRateLimited = rateLimiter.isRateLimited;
  const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;

  function useMemoryFirestore(seed) {
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

  beforeEach(() => {
    accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
    rateLimiter.isRateLimited = async () => false;
  });
  afterEach(() => {
    delete admin.firestore;
    rateLimiter.isRateLimited = realIsRateLimited;
    accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  });

  it("renames for the owner", async () => {
    const db = useMemoryFirestore(circle());
    expect(
      await index.renameGoalSpace.run(
        { spaceId: "c1", title: "Autumn 10K" },
        { auth: { uid: "owner" } }
      )
    ).toEqual({ title: "Autumn 10K", changed: true });
    expect(db.data.get("goalSpaces/c1").title).toBe("Autumn 10K");
  });

  it("refuses a restricted owner before anything is written", async () => {
    const db = useMemoryFirestore(
      circle({ "globalRestrictedUids/owner": { at: 1 } })
    );
    await expect(
      index.renameGoalSpace.run(
        { spaceId: "c1", title: "Autumn 10K" },
        { auth: { uid: "owner" } }
      )
    ).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "account-restricted" },
    });
    expect(db.data.get("goalSpaces/c1").title).toBe("Spring half");
  });

  it("says why a member who is not the owner is refused, and a signed-out caller", async () => {
    useMemoryFirestore(circle());
    await expect(
      index.renameGoalSpace.run(
        { spaceId: "c1", title: "Mine" },
        { auth: { uid: "maya" } }
      )
    ).rejects.toMatchObject({
      code: "permission-denied",
      message: "owner only",
    });
    await expect(
      index.renameGoalSpace.run({ spaceId: "c1", title: "Mine" }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

/**
 * Remove follower (Mob2 call 7): both edges of one follow of the caller,
 * deleted together (lib/followRemoval), behind the removeFollower
 * callable. The lib runs against the in-memory Firestore; the callable is
 * driven through `.run(data, context)` with the limiter, the deletion lock
 * and the lib swapped on their module objects.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const followRemoval = require("../lib/followRemoval");

const FOLLOWER = "followers/ana/users/bo";
const FOLLOWING = "following/bo/users/ana";

describe("removeFollower (lib)", () => {
  it("deletes both edges of the follow", async () => {
    const db = memoryFirestore({
      [FOLLOWER]: { followedAt: 1, fromRequest: true },
      [FOLLOWING]: { followedAt: 1, fromRequest: true },
      // Ana's own follow of Bo is a different follow, and stays.
      "following/ana/users/bo": { followedAt: 2 },
      "followers/bo/users/ana": { followedAt: 2 },
    });
    expect(await followRemoval.removeFollower(db, "ana", "bo")).toBe(true);
    expect(db.data.has(FOLLOWER)).toBe(false);
    expect(db.data.has(FOLLOWING)).toBe(false);
    expect(db.data.has("following/ana/users/bo")).toBe(true);
    expect(db.data.has("followers/bo/users/ana")).toBe(true);
  });

  it("takes away a half-written follow too", async () => {
    const db = memoryFirestore({ [FOLLOWER]: { followedAt: 1 } });
    expect(await followRemoval.removeFollower(db, "ana", "bo")).toBe(true);
    expect(db.data.has(FOLLOWER)).toBe(false);
  });

  it("writes nothing when there is no follow", async () => {
    const db = memoryFirestore({});
    expect(await followRemoval.removeFollower(db, "ana", "bo")).toBe(false);
    expect(db.operations).toEqual([]);
  });
});

describe("removeFollower (callable)", () => {
  const rateLimiter = require("../rateLimiter");
  const locks = require("../lib/accountDeletionLocks");
  const { removeFollower } = require("../index");
  const real = {
    limit: rateLimiter.isRateLimited,
    lock: locks.assertCallableActorNotDeleting,
    remove: followRemoval.removeFollower,
  };
  let calls;

  beforeEach(() => {
    calls = [];
    rateLimiter.isRateLimited = async (_db, uid, action, max, windowMs) => {
      calls.push(["limit", uid, action, max, windowMs]);
      return false;
    };
    locks.assertCallableActorNotDeleting = async (_db, uid) => {
      calls.push(["lock", uid]);
    };
    followRemoval.removeFollower = async (_db, uid, followerUid) => {
      calls.push(["remove", uid, followerUid]);
      return true;
    };
  });
  afterEach(() => {
    rateLimiter.isRateLimited = real.limit;
    locks.assertCallableActorNotDeleting = real.lock;
    followRemoval.removeFollower = real.remove;
  });

  it("removes the caller's follower, after the deletion lock and the limiter", async () => {
    await expect(
      removeFollower.run({ followerUid: "bo" }, { auth: { uid: "ana" } })
    ).resolves.toEqual({ removed: true });
    expect(calls).toEqual([
      ["lock", "ana"],
      ["limit", "ana", "removeFollower", 30, 60_000],
      ["remove", "ana", "bo"],
    ]);
  });

  it("is refused signed out, for the caller themself and for a bad id", async () => {
    await expect(
      removeFollower.run({ followerUid: "bo" }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
    for (const followerUid of ["ana", "", "a/b", 42, undefined]) {
      await expect(
        removeFollower.run({ followerUid }, { auth: { uid: "ana" } })
      ).rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(calls).toEqual([]);
  });

  it("is refused past the rate limit, before anything is removed", async () => {
    rateLimiter.isRateLimited = async () => true;
    await expect(
      removeFollower.run({ followerUid: "bo" }, { auth: { uid: "ana" } })
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(calls.some(([kind]) => kind === "remove")).toBe(false);
  });

  it("has a cap", () => {
    expect(removeFollower.__endpoint.maxInstances).toBe(100);
  });
});

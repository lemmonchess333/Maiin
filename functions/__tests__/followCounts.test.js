/**
 * Follow counts: `followCounts/{uid}` is how many people follow an account
 * and how many it follows, recounted from the two lists and never
 * incremented (lib/followCounts.js), so a profile shows the numbers
 * without reading who.
 *
 * Driven through the in-memory Firestore, which applies the count and the
 * transaction as Firestore does. The rules that keep clients from writing
 * a count are in firestore.followCounts.rules.test.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  COLLECTION,
  SIDES,
  edgeMovesCount,
  recountFollowSide,
  backfillFollowCounts,
} = require("../lib/followCounts");

let db;

beforeEach(() => {
  db = memoryFirestore();
});

const stored = (uid) => db.data.get(`followCounts/${uid}`);

/** `follower` follows `followed`: the two edges the app writes. */
function follow(follower, followed) {
  db.data.set(`following/${follower}/users/${followed}`, { followedAt: 1 });
  db.data.set(`followers/${followed}/users/${follower}`, { followedAt: 1 });
}

function unfollow(follower, followed) {
  db.data.delete(`following/${follower}/users/${followed}`);
  db.data.delete(`followers/${followed}/users/${follower}`);
}

/** What the two triggers do for one follow or unfollow. */
async function recountBoth(follower, followed) {
  await recountFollowSide(db, follower, "following");
  await recountFollowSide(db, followed, "followers");
}

describe("edgeMovesCount", () => {
  it("is true for an edge made and for one removed", () => {
    expect(edgeMovesCount(false, true)).toBe(true);
    expect(edgeMovesCount(true, false)).toBe(true);
  });

  it("is false for an edge rewritten, which changes no list's size", () => {
    expect(edgeMovesCount(true, true)).toBe(false);
    expect(edgeMovesCount(false, false)).toBe(false);
  });
});

describe("recountFollowSide", () => {
  it("stores how many follow an account, and when that was read", async () => {
    follow("bob", "alice");
    follow("carol", "alice");

    const result = await recountFollowSide(db, "alice", "followers");

    expect(result).toEqual({
      uid: "alice",
      side: "followers",
      count: 2,
      written: true,
      changed: true,
    });
    expect(stored("alice").followers).toBe(2);
    expect(stored("alice").followersAt).toBeInstanceOf(Date);
  });

  it("stores how many an account follows, apart from who follows it", async () => {
    follow("alice", "bob");
    follow("alice", "carol");
    follow("alice", "dave");
    follow("erin", "alice");

    await recountFollowSide(db, "alice", "following");
    expect(stored("alice")).toMatchObject({ following: 3 });
    expect(stored("alice")).not.toHaveProperty("followers");

    await recountFollowSide(db, "alice", "followers");
    expect(stored("alice")).toMatchObject({ following: 3, followers: 1 });
  });

  it("follows a follow and an unfollow to the right numbers on both accounts", async () => {
    follow("bob", "alice");
    await recountBoth("bob", "alice");
    expect(stored("alice").followers).toBe(1);
    expect(stored("bob").following).toBe(1);

    unfollow("bob", "alice");
    await recountBoth("bob", "alice");
    expect(stored("alice").followers).toBe(0);
    expect(stored("bob").following).toBe(0);
  });

  it("stores 0 for an account nobody follows, which is not the same as never counted", async () => {
    await recountFollowSide(db, "alice", "followers");
    expect(stored("alice").followers).toBe(0);
  });

  it("counts the same edges to the same number when delivered twice", async () => {
    follow("bob", "alice");
    await recountFollowSide(db, "alice", "followers");
    const again = await recountFollowSide(db, "alice", "followers");
    expect(stored("alice").followers).toBe(1);
    // Stored again, with its later read time, and the number did not move.
    expect(again).toMatchObject({ written: true, changed: false });
  });

  it("drops a count read before the one already stored", async () => {
    follow("bob", "alice");
    // A later recount has landed already, with its later read time.
    db.data.set("followCounts/alice", {
      followers: 5,
      followersAt: new Date(Date.now() + 60_000),
    });

    const result = await recountFollowSide(db, "alice", "followers");

    expect(result.written).toBe(false);
    expect(stored("alice").followers).toBe(5);
  });

  it("a later count of one side is not held back by the other side's time", async () => {
    follow("alice", "bob");
    db.data.set("followCounts/alice", {
      followers: 5,
      followersAt: new Date(Date.now() + 60_000),
    });

    const result = await recountFollowSide(db, "alice", "following");

    expect(result.written).toBe(true);
    expect(stored("alice")).toMatchObject({ followers: 5, following: 1 });
  });

  it("writes nothing for an account being deleted, whose edges are going", async () => {
    follow("bob", "alice");
    db.data.set("accountDeletionRequests/alice", { status: "running" });

    const result = await recountFollowSide(db, "alice", "followers");

    expect(result.written).toBe(false);
    expect(stored("alice")).toBeUndefined();
  });

  it("writes nothing for an account already deleted", async () => {
    db.data.set("deletedAccounts/alice", {
      expiresAt: Date.now() + 86_400_000,
    });

    const result = await recountFollowSide(db, "alice", "following");

    expect(result.written).toBe(false);
    expect(stored("alice")).toBeUndefined();
  });

  it("still counts the other person when one side of a follow is being deleted", async () => {
    follow("bob", "alice");
    db.data.set("accountDeletionRequests/alice", { status: "running" });
    // The executor removes Alice's edges; Bob follows one fewer.
    unfollow("bob", "alice");

    await recountBoth("bob", "alice");

    expect(stored("alice")).toBeUndefined();
    expect(stored("bob").following).toBe(0);
  });

  it("writes nothing for a side it does not know or an empty id", async () => {
    expect((await recountFollowSide(db, "alice", "friends")).written).toBe(
      false
    );
    expect((await recountFollowSide(db, "", "followers")).written).toBe(false);
    expect(db.operations).toEqual([]);
  });
});

describe("backfillFollowCounts", () => {
  it("counts both sides for every account, across pages", async () => {
    for (const uid of ["alice", "bob", "carol", "dave", "erin"]) {
      db.data.set(`users/${uid}`, { displayName: uid });
    }
    follow("bob", "alice");
    follow("carol", "alice");
    follow("alice", "dave");

    const totals = await backfillFollowCounts(db, { pageSize: 2 });

    expect(totals).toEqual({
      accounts: 5,
      written: 10,
      changed: 10,
      skipped: 0,
    });
    expect(stored("alice")).toMatchObject({ followers: 2, following: 1 });
    expect(stored("bob")).toMatchObject({ followers: 0, following: 1 });
    expect(stored("dave")).toMatchObject({ followers: 1, following: 0 });
    // Nobody follows Erin and she follows nobody: counted, at 0.
    expect(stored("erin")).toMatchObject({ followers: 0, following: 0 });
  });

  it("leaves an account being deleted alone and counts the rest", async () => {
    db.data.set("users/alice", {});
    db.data.set("users/bob", {});
    db.data.set("accountDeletionRequests/alice", { status: "running" });
    follow("bob", "alice");

    const totals = await backfillFollowCounts(db);

    expect(totals).toEqual({
      accounts: 2,
      written: 2,
      changed: 2,
      skipped: 2,
    });
    expect(stored("alice")).toBeUndefined();
    expect(stored("bob")).toMatchObject({ followers: 0, following: 1 });
  });

  it("can be run again without moving a number", async () => {
    db.data.set("users/alice", {});
    follow("bob", "alice");
    await backfillFollowCounts(db);
    const first = stored("alice").followers;
    const second = await backfillFollowCounts(db);
    expect(stored("alice").followers).toBe(first);
    // What the workflow's second pass checks.
    expect(second.changed).toBe(0);
  });
});

describe("the rules for followCounts", () => {
  const rules = readFileSync(
    fileURLToPath(new URL("../../firestore.rules", import.meta.url)),
    "utf8"
  );
  const start = rules.indexOf(`match /${COLLECTION}/{uid} {`);
  const block = rules.slice(start, rules.indexOf("\n    }", start));

  it("has a block of its own", () => {
    expect(start).toBeGreaterThan(-1);
  });

  it("lets no client write or list a count", () => {
    expect(block).toContain("allow write: if false;");
    expect(block).toContain("allow list: if false;");
  });

  it("names the two lists the module counts", () => {
    expect(Object.keys(SIDES)).toEqual(["followers", "following"]);
    expect(SIDES.followers.list).toBe("followers");
    expect(SIDES.following.list).toBe("following");
  });
});

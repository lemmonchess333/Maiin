/**
 * Soc15 — a new follow routes the person's recent shared sessions to the
 * follower's feed (lib/followBackfill.js), so Following is not empty until
 * they next train.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  backfillFollowedPosts,
  BACKFILL_DAYS,
  BACKFILL_LIMIT,
} = require("../lib/followBackfill");
const { FEED_COPY_RETENTION_DAYS } = require("../lib/feedIndex");
const { STATUS } = require("../lib/accountDeletionLedger");

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 10, 3, 12);

function ts(ms) {
  return { toMillis: () => ms };
}

/** A Firestore stub: `activities` answers the backfill's query from
 *  `posts` (recording its filters), documents live in `docs`, and a
 *  transaction reads and writes them. */
function makeFirestore({ posts = [], docs = {} } = {}) {
  const state = { ...docs };
  const query = { filters: [], order: null, limit: null };
  const writes = [];

  function docRef(path) {
    return { path, id: path.split("/").pop() };
  }
  function collection(path) {
    const builder = {
      doc(id) {
        const ref = docRef(`${path}/${id}`);
        ref.collection = (sub) => collection(`${path}/${id}/${sub}`);
        return ref;
      },
      where(field, op, value) {
        query.filters.push([field, op, value]);
        return builder;
      },
      orderBy(field, dir) {
        query.order = [field, dir];
        return builder;
      },
      limit(n) {
        query.limit = n;
        return builder;
      },
      async get() {
        return {
          docs: posts.map((p) => ({ id: p.id, data: () => p.data })),
        };
      },
    };
    return builder;
  }
  const firestore = {
    collection,
    async runTransaction(fn) {
      const tx = {
        async get(ref) {
          const exists = Object.prototype.hasOwnProperty.call(state, ref.path);
          return { exists, data: () => state[ref.path] };
        },
        set(ref, data) {
          writes.push({ path: ref.path, data });
          state[ref.path] = data;
        },
      };
      return fn(tx);
    },
  };
  return { firestore, query, writes };
}

function post(id, daysAgo) {
  return {
    id,
    data: { authorId: "author", createdAt: ts(NOW - daysAgo * DAY_MS) },
  };
}

describe("backfillFollowedPosts", () => {
  it("asks for the author's shared posts of the last 30 days, newest first, at most 10", async () => {
    const { firestore, query } = makeFirestore();
    await backfillFollowedPosts({
      firestore,
      followerUid: "follower",
      authorUid: "author",
      now: NOW,
    });
    expect(query.filters).toEqual([
      ["authorId", "==", "author"],
      ["visibility", "in", ["public", "followers"]],
      ["createdAt", ">=", new Date(NOW - BACKFILL_DAYS * DAY_MS)],
    ]);
    expect(query.order).toEqual(["createdAt", "desc"]);
    expect(query.limit).toBe(BACKFILL_LIMIT);
  });

  it("routes each post to the follower's feed, dated by the post", async () => {
    const { firestore, writes } = makeFirestore({
      posts: [post("a1", 1), post("a2", 9)],
    });
    const result = await backfillFollowedPosts({
      firestore,
      followerUid: "follower",
      authorUid: "author",
      now: NOW,
    });
    expect(result).toEqual({ written: 2 });
    expect(writes.map((w) => w.path)).toEqual([
      "feeds/follower/items/a1",
      "feeds/follower/items/a2",
    ]);
    const row = writes[0].data;
    expect(row.activityId).toBe("a1");
    expect(row.authorId).toBe("author");
    expect(row.createdAt.toMillis()).toBe(NOW - DAY_MS);
    expect(row.expiresAt.getTime()).toBe(
      NOW - DAY_MS + FEED_COPY_RETENTION_DAYS * DAY_MS
    );
    // A routing index, never a copy of the post.
    expect(Object.keys(row).sort()).toEqual(
      [
        "activityId",
        "authorId",
        "createdAt",
        "expiresAt",
        "schemaVersion",
      ].sort()
    );
  });

  it("leaves a row the fan-out already wrote alone", async () => {
    const { firestore, writes } = makeFirestore({
      posts: [post("a1", 1), post("a2", 2)],
      docs: { "feeds/follower/items/a1": { activityId: "a1" } },
    });
    const result = await backfillFollowedPosts({
      firestore,
      followerUid: "follower",
      authorUid: "author",
      now: NOW,
    });
    expect(result).toEqual({ written: 1 });
    expect(writes.map((w) => w.path)).toEqual(["feeds/follower/items/a2"]);
  });

  it("writes nothing when either account is being deleted", async () => {
    for (const uid of ["author", "follower"]) {
      const { firestore, writes } = makeFirestore({
        posts: [post("a1", 1)],
        docs: {
          [`accountDeletionRequests/${uid}`]: { status: STATUS.RUNNING },
        },
      });
      const result = await backfillFollowedPosts({
        firestore,
        followerUid: "follower",
        authorUid: "author",
        now: NOW,
      });
      expect(result).toEqual({ written: 0 });
      expect(writes).toEqual([]);
    }
  });

  it("does nothing for a follow of yourself or a post with no date", async () => {
    const self = makeFirestore({ posts: [post("a1", 1)] });
    expect(
      await backfillFollowedPosts({
        firestore: self.firestore,
        followerUid: "author",
        authorUid: "author",
        now: NOW,
      })
    ).toEqual({ written: 0 });
    const undated = makeFirestore({
      posts: [{ id: "a1", data: { authorId: "author" } }],
    });
    expect(
      await backfillFollowedPosts({
        firestore: undated.firestore,
        followerUid: "follower",
        authorUid: "author",
        now: NOW,
      })
    ).toEqual({ written: 0 });
    expect(undated.writes).toEqual([]);
  });
});

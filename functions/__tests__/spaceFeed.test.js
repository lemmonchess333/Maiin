/**
 * A Space's members' sessions (Run27 call 11): `spaces/{id}/sessions/{postId}`
 * routes a member's public post to the Spaces they are in, and nothing
 * else (lib/spaceFeed.js).
 *
 * Driven through the in-memory Firestore, which applies the queries and
 * the transactions as Firestore does. Every time is derived from the
 * clock, so the suite means the same thing on any day and under the
 * +90-day run.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const feed = require("../lib/spaceFeed");
const ledger = require("../lib/accountDeletionLedger");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (days) => new Date(NOW - days * DAY);

const ANA = "ana";
const BEN = "ben";
const RUNNERS = "runners";
const LIFTERS = "lifters";
const BRIGHTON = "brighton-marathon";

const member = (uid) => ({ uid, joinedAt: ago(30) });
const post = (authorId, extra = {}) => ({
  authorId,
  authorName: "Ana",
  type: "run",
  visibility: "public",
  distance: 5000,
  createdAt: ago(1),
  kudosCount: 0,
  commentCount: 0,
  ...extra,
});

/** Ana is in Runners and Lifters, and in a Circle; Ben is in Runners. */
function world(extra = {}) {
  return memoryFirestore({
    [`spaces/${RUNNERS}/members/${ANA}`]: member(ANA),
    [`spaces/${LIFTERS}/members/${ANA}`]: member(ANA),
    [`spaces/${RUNNERS}/members/${BEN}`]: member(BEN),
    [`goalSpaces/circle1/members/${ANA}`]: member(ANA),
    ...extra,
  });
}

/** The Spaces a post has a row in, sorted. */
const rowsOf = (db, postId) =>
  [...db.data.keys()]
    .filter((path) => path.endsWith(`/sessions/${postId}`))
    .map((path) => path.split("/")[1])
    .sort();

describe("which posts a Space shows", () => {
  it("a member's public post gets a row in each Space they are in, and only those", async () => {
    const db = world({ "activities/p1": post(ANA) });
    expect(await feed.syncActivityRows(db, "p1")).toEqual({
      added: 2,
      removed: 0,
    });
    // Not Ben's Brighton, not the Circle.
    expect(rowsOf(db, "p1")).toEqual([LIFTERS, RUNNERS]);
    const row = db.data.get(`spaces/${RUNNERS}/sessions/p1`);
    // A routing row: the post and its author, nothing of the post itself.
    expect(Object.keys(row).sort()).toEqual([
      "activityId",
      "authorId",
      "createdAt",
    ]);
    expect(row.authorId).toBe(ANA);
  });

  it("a followers-only post and a private post get no row", async () => {
    const db = world({
      "activities/followers": post(ANA, { visibility: "followers" }),
      "activities/private": post(ANA, { visibility: "private" }),
    });
    await feed.syncActivityRows(db, "followers");
    await feed.syncActivityRows(db, "private");
    expect(rowsOf(db, "followers")).toEqual([]);
    expect(rowsOf(db, "private")).toEqual([]);
  });

  it("a post narrowed to followers or made private loses its rows; made public again, it gets them back", async () => {
    const db = world({ "activities/p1": post(ANA) });
    await feed.syncActivityRows(db, "p1");
    expect(rowsOf(db, "p1")).toEqual([LIFTERS, RUNNERS]);

    db.data.set("activities/p1", post(ANA, { visibility: "followers" }));
    expect(await feed.syncActivityRows(db, "p1")).toEqual({
      added: 0,
      removed: 2,
    });
    expect(rowsOf(db, "p1")).toEqual([]);

    db.data.set("activities/p1", post(ANA, { visibility: "private" }));
    await feed.syncActivityRows(db, "p1");
    expect(rowsOf(db, "p1")).toEqual([]);

    db.data.set("activities/p1", post(ANA));
    await feed.syncActivityRows(db, "p1");
    expect(rowsOf(db, "p1")).toEqual([LIFTERS, RUNNERS]);
  });

  it("a flagged post and a deleted post lose their rows", async () => {
    const db = world({
      "activities/p1": post(ANA),
      "activities/p2": post(ANA),
    });
    await feed.syncActivityRows(db, "p1");
    await feed.syncActivityRows(db, "p2");

    // The word filter flags a post and makes it private; a flag alone is
    // enough to keep it out.
    db.data.set("activities/p1", post(ANA, { flagged: true }));
    await feed.syncActivityRows(db, "p1");
    expect(rowsOf(db, "p1")).toEqual([]);

    db.data.delete("activities/p2");
    await feed.syncActivityRows(db, "p2");
    expect(rowsOf(db, "p2")).toEqual([]);
  });

  it("a restricted author's post gets no row", async () => {
    const db = world({
      "activities/p1": post(ANA),
      [`globalRestrictedUids/${ANA}`]: { uid: ANA },
    });
    await feed.syncActivityRows(db, "p1");
    expect(rowsOf(db, "p1")).toEqual([]);
  });

  it("an author being deleted gets no row", async () => {
    const db = world({
      "activities/p1": post(ANA),
      [`accountDeletionRequests/${ANA}`]: { status: ledger.STATUS.RUNNING },
    });
    await feed.syncActivityRows(db, "p1");
    expect(rowsOf(db, "p1")).toEqual([]);
  });

  it("a second delivery writes nothing", async () => {
    const db = world({ "activities/p1": post(ANA) });
    await feed.syncActivityRows(db, "p1");
    const writes = db.operations.length;
    expect(await feed.syncActivityRows(db, "p1")).toEqual({
      added: 0,
      removed: 0,
    });
    expect(db.operations.length).toBe(writes);
  });
});

describe("the trigger's gate", () => {
  const pub = post(ANA);
  it("reads for a post created public, and for none created followers-only or private", () => {
    expect(feed.activityWriteMayMoveRows(null, pub)).toBe(true);
    expect(
      feed.activityWriteMayMoveRows(
        null,
        post(ANA, { visibility: "followers" })
      )
    ).toBe(false);
    expect(
      feed.activityWriteMayMoveRows(null, post(ANA, { visibility: "private" }))
    ).toBe(false);
  });

  it("reads for a delete, a change of who sees it and a flag; not for a prop or a comment", () => {
    expect(feed.activityWriteMayMoveRows(pub, null)).toBe(true);
    expect(
      feed.activityWriteMayMoveRows(pub, { ...pub, visibility: "followers" })
    ).toBe(true);
    expect(feed.activityWriteMayMoveRows(pub, { ...pub, flagged: true })).toBe(
      true
    );
    expect(feed.activityWriteMayMoveRows(pub, { ...pub, kudosCount: 3 })).toBe(
      false
    );
    expect(
      feed.activityWriteMayMoveRows(pub, { ...pub, commentCount: 1 })
    ).toBe(false);
  });
});

describe("joining and leaving", () => {
  it("joining brings in the member's public posts of the last four weeks, and no other", async () => {
    const db = world({
      "activities/recent": post(ANA, { createdAt: ago(3) }),
      "activities/old": post(ANA, {
        createdAt: ago(feed.JOIN_BACKFILL_DAYS + 2),
      }),
      "activities/followers": post(ANA, {
        visibility: "followers",
        createdAt: ago(2),
      }),
      "activities/bens": post(BEN, { createdAt: ago(1) }),
    });
    db.data.set(`spaces/${BRIGHTON}/members/${ANA}`, member(ANA));
    expect(await feed.syncMemberRows(db, BRIGHTON, ANA, { now: NOW })).toEqual({
      added: 1,
      removed: 0,
    });
    expect(rowsOf(db, "recent")).toEqual([BRIGHTON]);
    expect(rowsOf(db, "old")).toEqual([]);
    expect(rowsOf(db, "followers")).toEqual([]);
    expect(rowsOf(db, "bens")).toEqual([]);
  });

  it("leaving takes every row of theirs out of that Space and no other", async () => {
    const db = world({ "activities/p1": post(ANA) });
    await feed.syncActivityRows(db, "p1");
    db.data.delete(`spaces/${RUNNERS}/members/${ANA}`);
    expect(await feed.syncMemberRows(db, RUNNERS, ANA, { now: NOW })).toEqual({
      added: 0,
      removed: 1,
    });
    expect(rowsOf(db, "p1")).toEqual([LIFTERS]);
  });

  it("a restricted account joining brings nothing in", async () => {
    const db = world({
      "activities/p1": post(ANA),
      [`globalRestrictedUids/${ANA}`]: { uid: ANA },
    });
    db.data.set(`spaces/${BRIGHTON}/members/${ANA}`, member(ANA));
    await feed.syncMemberRows(db, BRIGHTON, ANA, { now: NOW });
    expect(rowsOf(db, "p1")).toEqual([]);
  });
});

describe("a restriction", () => {
  it("takes the account's posts out of every Space, and lifting it brings the recent ones back", async () => {
    const db = world({
      "activities/p1": post(ANA),
      "activities/p2": post(ANA, { createdAt: ago(2) }),
      "activities/bens": post(BEN),
    });
    for (const id of ["p1", "p2", "bens"]) await feed.syncActivityRows(db, id);

    db.data.set(`globalRestrictedUids/${ANA}`, { uid: ANA });
    expect(await feed.removeAuthorRows(db, ANA)).toBe(4);
    expect(rowsOf(db, "p1")).toEqual([]);
    expect(rowsOf(db, "p2")).toEqual([]);
    // Ben's post stays.
    expect(rowsOf(db, "bens")).toEqual([RUNNERS]);

    db.data.delete(`globalRestrictedUids/${ANA}`);
    expect(await feed.restoreAuthorRows(db, ANA, { now: NOW })).toBe(4);
    expect(rowsOf(db, "p1")).toEqual([LIFTERS, RUNNERS]);
    expect(rowsOf(db, "p2")).toEqual([LIFTERS, RUNNERS]);
  });
});

describe("indexes", () => {
  const indexes = JSON.parse(
    readFileSync(
      new URL("../../firestore.indexes.json", import.meta.url),
      "utf8"
    )
  );
  const groupField = (field) =>
    indexes.fieldOverrides.find(
      (o) => o.collectionGroup === feed.ROWS && o.fieldPath === field
    );

  it("the rows' collection-group fields the server queries are indexed", () => {
    // Production refuses a collection-group query without its index; the
    // emulator does not, so the index is pinned here.
    for (const field of ["activityId", "authorId"]) {
      expect(
        groupField(field)?.indexes.some(
          (i) => i.queryScope === "COLLECTION_GROUP" && i.order === "ASCENDING"
        ),
        field
      ).toBe(true);
    }
  });
});

describe("the backfill for members who joined before the triggers", () => {
  const { backfillSpaceMembers } = require("../lib/spaceBackfill");

  it("brings each member's recent public posts into their Spaces, and a second run adds nothing", async () => {
    const db = world({
      "activities/recent": post(ANA, { createdAt: ago(3) }),
      "activities/followers": post(ANA, { visibility: "followers" }),
      "activities/bens": post(BEN, { createdAt: ago(2) }),
    });
    const first = await backfillSpaceMembers(db, {
      now: NOW,
      spaceIds: [RUNNERS, LIFTERS],
    });
    expect(first).toMatchObject({ spaces: 2, members: 3, rowsAdded: 3 });
    expect(rowsOf(db, "recent")).toEqual([LIFTERS, RUNNERS]);
    expect(rowsOf(db, "bens")).toEqual([RUNNERS]);
    expect(rowsOf(db, "followers")).toEqual([]);

    const again = await backfillSpaceMembers(db, {
      now: NOW,
      spaceIds: [RUNNERS, LIFTERS],
    });
    expect(again.rowsAdded).toBe(0);
  });
});

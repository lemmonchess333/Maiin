/**
 * The word filter over Community Space posts (lib/spacePostModeration.js,
 * wired as onSpacePostWritten). Driven against the in-memory Firestore so
 * the post, its likes and its comments really go, or really stay.
 *
 *   - A new post whose title, body or author name trips the filter is
 *     removed, subcollections and all.
 *   - An edit that makes a clean post objectionable is caught too.
 *   - A write that leaves the text alone (the server's like and comment
 *     counters) costs no read.
 *   - At-least-once: a retried event, or a post its author already
 *     reworded, deletes nothing.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  removeObjectionableSpacePost,
  SPACE_POST_MAX_BYTES,
  SPACE_POST_TEXT_FIELDS,
} = require("../lib/spacePostModeration");
const { storedSize } = require("../lib/storedSize");

const POST = "spaces/runners/posts/p1";

function post(overrides = {}) {
  return {
    authorId: "author-1",
    authorName: "Sam",
    title: "Long run",
    body: "20 km at an easy pace.",
    likeCount: 0,
    commentCount: 0,
    ...overrides,
  };
}

function quietLogger() {
  const lines = [];
  return { lines, warn: (msg, data) => lines.push([msg, data]) };
}

async function run(db, { before, after }) {
  const logger = quietLogger();
  const result = await removeObjectionableSpacePost({
    firestore: db,
    ref: db.doc(POST),
    before,
    after,
    logger,
  });
  return { result, logger };
}

describe("removeObjectionableSpacePost", () => {
  it("scans the title, the body and the author name", () => {
    expect([...SPACE_POST_TEXT_FIELDS]).toEqual([
      "title",
      "body",
      "authorName",
    ]);
  });

  it("keeps a clean new post", async () => {
    const db = memoryFirestore({ [POST]: post() });
    const { result } = await run(db, { before: null, after: post() });
    expect(result).toEqual({ removed: false });
    expect(db.data.has(POST)).toBe(true);
  });

  it.each([
    ["body", { body: "this route sucks" }],
    ["title", { title: "shit weather" }],
    ["authorName", { authorName: "shit head" }],
  ])("removes a new post whose %s trips the filter", async (field, change) => {
    const bad = post(change);
    const db = memoryFirestore({ [POST]: bad });
    const { result, logger } = await run(db, { before: null, after: bad });
    expect(result).toEqual({ removed: true, field });
    expect(db.data.has(POST)).toBe(false);
    // The log line says which post and field, and carries no text.
    expect(logger.lines).toEqual([
      [
        "onSpacePostWritten.auto_remove",
        { path: POST, authorId: "author-1", field },
      ],
    ]);
  });

  it("keeps the largest post the composer writes", async () => {
    const largest = post({
      title: "t".repeat(120),
      body: "b".repeat(4000),
      authorName: "a".repeat(50),
      authorPhotoURL: `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/profile-photos%2F${"u".repeat(1900)}`,
      photoUrl: `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/space-photos%2F${"u".repeat(1900)}`,
      activity: {
        type: "run",
        distance: 42195,
        avgPace: 330,
        duration: 13925,
        elevationGain: 220,
        routePreview: Array.from({ length: 100 }, (_, i) => ({
          lat: 51.5 + i / 1000,
          lon: -0.12,
        })),
      },
    });
    expect(storedSize(largest)).toBeLessThan(SPACE_POST_MAX_BYTES / 3);
    const db = memoryFirestore({ [POST]: largest });
    const { result } = await run(db, { before: null, after: largest });
    expect(result).toEqual({ removed: false });
    expect(db.data.has(POST)).toBe(true);
  });

  it("removes a new post past the size limit", async () => {
    // The rules cannot see inside the route's points.
    const heavy = post({
      activity: {
        type: "run",
        routePreview: Array(100).fill({
          lat: 0,
          lon: 0,
          note: "y".repeat(9000),
        }),
      },
    });
    const db = memoryFirestore({ [POST]: heavy });
    const { result, logger } = await run(db, { before: null, after: heavy });
    expect(result).toEqual({ removed: true, field: "size" });
    expect(db.data.has(POST)).toBe(false);
    expect(logger.lines[0][1]).toMatchObject({ path: POST, field: "size" });
  });

  it("removes the likes and comments under a removed post", async () => {
    const bad = post({ body: "sucks" });
    const db = memoryFirestore({
      [POST]: bad,
      [`${POST}/likes/u2`]: { createdAt: 1 },
      [`${POST}/comments/c1`]: { authorId: "u2", text: "hi" },
      "spaces/runners/posts/p2": post(),
    });
    await run(db, { before: null, after: bad });
    expect([...db.data.keys()]).toEqual(["spaces/runners/posts/p2"]);
  });

  it("catches an edit that makes a clean post objectionable", async () => {
    const edited = post({ body: "edited: this sucks" });
    const db = memoryFirestore({ [POST]: edited });
    const { result } = await run(db, { before: post(), after: edited });
    expect(result.removed).toBe(true);
    expect(db.data.has(POST)).toBe(false);
  });

  it("skips a write that leaves the text alone, without a read", async () => {
    // A counter bump on a post: nothing new to scan. (The seeded text trips
    // the filter on purpose; it predates the write and is not re-judged on
    // every like.)
    const legacy = post({ body: "sucks", likeCount: 1 });
    const db = memoryFirestore({ [POST]: legacy });
    // Any read of the post now throws, so reaching one fails the test.
    db.failures.set(`get:${POST}`, new Error("read the post"));
    const { result } = await run(db, {
      before: post({ body: "sucks" }),
      after: legacy,
    });
    expect(result).toEqual({ removed: false });
    expect(db.operations).toEqual([]);
    expect(db.data.has(POST)).toBe(true);
  });

  it("does nothing for a delete", async () => {
    const db = memoryFirestore({});
    db.failures.set(`get:${POST}`, new Error("read the post"));
    const { result } = await run(db, { before: post(), after: null });
    expect(result).toEqual({ removed: false });
    expect(db.operations).toEqual([]);
  });

  it("deletes nothing on a retried event once the post is gone", async () => {
    const bad = post({ body: "sucks" });
    const db = memoryFirestore({ [POST]: bad });
    await run(db, { before: null, after: bad });
    const writesAfterFirst = db.operations.length;
    const { result, logger } = await run(db, { before: null, after: bad });
    expect(result).toEqual({ removed: false });
    expect(db.operations.length).toBe(writesAfterFirst);
    expect(logger.lines).toEqual([]);
  });

  it("keeps a post its author reworded before the event was handled", async () => {
    // The event still carries the objectionable version; the post as it is
    // now is clean, and that is what the transaction judges.
    const db = memoryFirestore({ [POST]: post({ body: "Reworded." }) });
    const { result } = await run(db, {
      before: null,
      after: post({ body: "sucks" }),
    });
    expect(result).toEqual({ removed: false });
    expect(db.data.get(POST).body).toBe("Reworded.");
  });
});

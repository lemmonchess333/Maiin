/**
 * Audit PR 3 — socialFanout helper tests.
 *
 * Pins server-side feed fan-out and notification creation behavior.
 * These two operations move client-direct writes off `/feeds/*` and
 * `/notifications/*` (which post-PR-3 are `create: if false` for
 * clients) and into trigger / callable paths.
 *
 *   fanoutActivityToFeeds — runs from the `onActivityCreated`
 *     Firestore trigger. Reads followers, writes one feed item per
 *     follower + one to the author's own feed.
 *   createNotification — invoked inside `toggleKudosCallable` and
 *     `addCommentCallable` to write the recipient's notification doc
 *     atomically with the kudos / comment write.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const TS_TAG = "__TS__";
const serverTimestamp = () => ({ tag: TS_TAG });

/**
 * Firestore stub: extends the socialCounters stub with `.get()`
 * support on collections so the fanout helper can iterate followers.
 */
function makeFirestoreStub({ initial = {}, collections = {} } = {}) {
  const state = { ...initial };
  const collectionDocs = { ...collections };
  const writes = [];

  function makeRef(path) {
    return {
      _path: path,
      id: path.split("/").pop(),
      collection(sub) {
        return makeCollection(`${path}/${sub}`);
      },
      set: vi.fn(async (data) => {
        writes.push({ op: "set", path, data });
        state[path] = data;
      }),
    };
  }
  function makeCollection(path) {
    let autoCounter = 0;
    return {
      _path: path,
      doc(id) {
        if (id === undefined) {
          autoCounter += 1;
          return makeRef(`${path}/auto-${autoCounter}`);
        }
        return makeRef(`${path}/${id}`);
      },
      get: vi.fn(async () => {
        const docs = collectionDocs[path] || [];
        return {
          docs: docs.map((d) => ({
            id: d.id,
            data: () => d.data || {},
          })),
          size: docs.length,
        };
      }),
    };
  }

  return {
    collection(name) {
      return makeCollection(name);
    },
    _state: state,
    _writes: writes,
  };
}

describe("fanoutActivityToFeeds", () => {
  it("Cycle 1 (tracer): fans out a public activity to all followers + author", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub({
      collections: {
        "followers/alice/users": [{ id: "bob" }, { id: "carol" }],
      },
    });

    const result = await fanoutActivityToFeeds({
      firestore,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        type: "run",
        visibility: "public",
        distance: 5000,
        duration: 1800,
        runName: "Morning Run",
      },
      serverTimestamp,
    });

    expect(result.fanned).toBe(3); // bob + carol + alice (own feed)
    const feedWrites = firestore._writes.filter((w) =>
      w.path.startsWith("feeds/")
    );
    expect(feedWrites).toHaveLength(3);
    const paths = feedWrites.map((w) => w.path);
    expect(paths.some((p) => p.startsWith("feeds/bob/items/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("feeds/carol/items/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("feeds/alice/items/"))).toBe(true);
  });

  it("CROSS-H1: re-delivery overwrites the same feed item (deterministic doc id = activityId)", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub({
      collections: {
        "followers/alice/users": [{ id: "bob" }, { id: "carol" }],
      },
    });
    const args = {
      firestore,
      activityId: "act1",
      authorId: "alice",
      activityData: { authorName: "Alice", type: "run", visibility: "public" },
      serverTimestamp,
    };

    await fanoutActivityToFeeds(args);
    await fanoutActivityToFeeds(args); // simulate at-least-once re-delivery

    const feedPaths = firestore._writes
      .filter((w) => w.path.startsWith("feeds/"))
      .map((w) => w.path);
    // Both deliveries write, but each recipient's item is keyed on activityId
    // → the second run overwrites. 3 DISTINCT paths, not 6 (pre-fix the
    // auto-generated ids produced 6 → duplicate feed items).
    expect(new Set(feedPaths).size).toBe(3);
    expect(feedPaths).toContain("feeds/bob/items/act1");
    expect(feedPaths).toContain("feeds/carol/items/act1");
    expect(feedPaths).toContain("feeds/alice/items/act1");
  });

  it("skips fan-out for private activities entirely", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub({
      collections: {
        "followers/alice/users": [{ id: "bob" }],
      },
    });

    const result = await fanoutActivityToFeeds({
      firestore,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        type: "run",
        visibility: "private",
        distance: 5000,
      },
      serverTimestamp,
    });

    expect(result.fanned).toBe(0);
    expect(firestore._writes).toEqual([]);
  });

  it("writes only to author's own feed when no followers exist", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub({
      collections: {
        "followers/alice/users": [], // No followers
      },
    });

    const result = await fanoutActivityToFeeds({
      firestore,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        type: "workout",
        visibility: "public",
        workoutName: "Push Day",
        exerciseCount: 5,
        totalVolume: 4200,
        duration: 3600,
      },
      serverTimestamp,
    });

    expect(result.fanned).toBe(1);
    expect(firestore._writes).toHaveLength(1);
    expect(firestore._writes[0].path).toMatch(/^feeds\/alice\/items\//);
  });

  it("builds a run summary server-side (km · time · pace)", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub({
      collections: { "followers/alice/users": [] },
    });

    await fanoutActivityToFeeds({
      firestore,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        type: "run",
        visibility: "public",
        distance: 5000, // 5km
        duration: 1500, // 25:00
        avgPace: 300, // 5:00/km
        runName: "Tempo",
      },
      serverTimestamp,
    });

    const item = firestore._writes[0].data;
    expect(item.summary).toContain("5.0km");
    expect(item.summary).toContain("25:00");
    expect(item.summary).toContain("5:00/km");
    expect(item.summary).toContain("Tempo");
  });

  it("builds a workout summary server-side (name · exercises · volume · duration)", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub({
      collections: { "followers/alice/users": [] },
    });

    await fanoutActivityToFeeds({
      firestore,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        type: "workout",
        visibility: "public",
        workoutName: "Push Day",
        exerciseCount: 6,
        totalVolume: 5200,
        duration: 3600,
      },
      serverTimestamp,
    });

    const item = firestore._writes[0].data;
    expect(item.summary).toContain("Push Day");
    expect(item.summary).toContain("6 exercises");
    expect(item.summary).toContain("5,200 kg volume");
    expect(item.summary).toContain("60 min");
  });

  it("carries highlight flags (prHit, badgeEarned, challengeMilestone) onto the feed item", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub({
      collections: { "followers/alice/users": [] },
    });

    await fanoutActivityToFeeds({
      firestore,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        type: "workout",
        visibility: "public",
        workoutName: "Push Day",
        prHit: true,
        badgeEarned: "first-bench",
        challengeMilestone: "5x5",
      },
      serverTimestamp,
    });

    const item = firestore._writes[0].data;
    expect(item.prHit).toBe(true);
    expect(item.badgeEarned).toBe("first-bench");
    expect(item.challengeMilestone).toBe("5x5");
  });

  it("includes authorPhotoURL when present, omits when absent", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    const fs1 = makeFirestoreStub({
      collections: { "followers/alice/users": [] },
    });
    await fanoutActivityToFeeds({
      firestore: fs1,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        authorPhotoURL: "https://example.com/a.jpg",
        type: "run",
        visibility: "public",
        distance: 1000,
      },
      serverTimestamp,
    });
    expect(fs1._writes[0].data.authorPhotoURL).toBe(
      "https://example.com/a.jpg"
    );

    const fs2 = makeFirestoreStub({
      collections: { "followers/alice/users": [] },
    });
    await fanoutActivityToFeeds({
      firestore: fs2,
      activityId: "act1",
      authorId: "alice",
      activityData: {
        authorName: "Alice",
        type: "run",
        visibility: "public",
        distance: 1000,
      },
      serverTimestamp,
    });
    expect(fs2._writes[0].data).not.toHaveProperty("authorPhotoURL");
  });

  it("requires firestore, activityId, authorId", async () => {
    const { fanoutActivityToFeeds } = require("../lib/socialFanout");
    await expect(
      fanoutActivityToFeeds({ firestore: null, activityId: "x", authorId: "y" })
    ).rejects.toThrow();
    await expect(
      fanoutActivityToFeeds({ firestore: {}, activityId: "", authorId: "y" })
    ).rejects.toThrow();
    await expect(
      fanoutActivityToFeeds({ firestore: {}, activityId: "x", authorId: "" })
    ).rejects.toThrow();
  });
});

describe("createNotification", () => {
  it("Cycle 1 (tracer): writes a notification doc to the recipient's items collection", async () => {
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();

    const result = await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "bob",
      data: {
        type: "kudos",
        fromName: "Alice",
        activityId: "act1",
        message: "Alice gave you props",
      },
      serverTimestamp,
    });

    expect(result.notificationId).toBeTruthy();
    expect(firestore._writes).toHaveLength(1);
    expect(firestore._writes[0].path).toMatch(/^notifications\/bob\/items\//);
    const data = firestore._writes[0].data;
    expect(data.type).toBe("kudos");
    expect(data.fromUserId).toBe("alice");
    expect(data.fromName).toBe("Alice");
    expect(data.activityId).toBe("act1");
    expect(data.read).toBe(false);
    expect(data.createdAt).toEqual({ tag: TS_TAG });
  });

  it("self-notification is a no-op (fromUid === toUid)", async () => {
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();

    const result = await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "alice",
      data: { type: "kudos", activityId: "act1" },
      serverTimestamp,
    });

    expect(result.skipped).toBe(true);
    expect(firestore._writes).toEqual([]);
  });

  it("rejects unknown notification types", async () => {
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();
    await expect(
      createNotification({
        firestore,
        fromUid: "alice",
        toUid: "bob",
        data: { type: "phishing", message: "click here" },
        serverTimestamp,
      })
    ).rejects.toThrow(/type must be one of/);
  });

  it("caps string field lengths (fromName 100, message 200, activityId 64)", async () => {
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();

    await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "bob",
      data: {
        type: "comment",
        fromName: "A".repeat(500),
        activityId: "x".repeat(200),
        message: "M".repeat(1000),
      },
      serverTimestamp,
    });

    const data = firestore._writes[0].data;
    expect(data.fromName.length).toBe(100);
    expect(data.activityId.length).toBe(64);
    expect(data.message.length).toBe(200);
  });

  it("requires firestore, fromUid, toUid", async () => {
    const { createNotification } = require("../lib/socialFanout");
    await expect(
      createNotification({ firestore: null, fromUid: "a", toUid: "b" })
    ).rejects.toThrow();
    await expect(
      createNotification({ firestore: {}, fromUid: "", toUid: "b" })
    ).rejects.toThrow();
    await expect(
      createNotification({ firestore: {}, fromUid: "a", toUid: "" })
    ).rejects.toThrow();
  });

  it("overrides client-supplied fromUserId with the authenticated fromUid", async () => {
    // Prevents the "impersonation via callable payload" attack —
    // if a hostile client sends { type, fromUserId: 'mod-account' },
    // the server must overwrite with the authed uid.
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();

    await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "bob",
      data: {
        type: "kudos",
        fromUserId: "admin-account", // hostile payload
        message: "hi",
      },
      serverTimestamp,
    });

    expect(firestore._writes[0].data.fromUserId).toBe("alice");
  });
});

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
      /* Doc reads. Added when createNotification gained its block backstop:
         without a `get`, the guard's lookup threw, and because that guard
         fails CLOSED every notification in this suite was silently skipped.
         Seed `blocks/{blocker}/users/{blocked}` via `initial` to model a
         block. */
      get: vi.fn(async () => ({
        exists: Object.prototype.hasOwnProperty.call(state, path),
        data: () => state[path],
      })),
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

  it("CIRCLE-ACTIVITY-NOTIFICATIONS: accepts the four named Circle types (non-anonymous)", async () => {
    const { createNotification } = require("../lib/socialFanout");
    for (const type of [
      "circle_milestone",
      "circle_needs_support",
      "circle_joined",
      "circle_routine_shared",
    ]) {
      const firestore = makeFirestoreStub();
      await createNotification({
        firestore,
        fromUid: "alice",
        toUid: "bob",
        data: { type, fromName: "Alice" },
        serverTimestamp,
      });
      const data = firestore._writes[0].data;
      expect(data.type).toBe(type);
      // Named — the actor rides along (recipient already sees them in
      // the shared Circle timeline).
      expect(data.fromUserId).toBe("alice");
      expect(data.fromName).toBe("Alice");
    }
  });

  it("notificationId writes to a DETERMINISTIC doc id (idempotent trigger fan-out)", async () => {
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();
    await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "bob",
      data: { type: "circle_milestone", fromName: "Alice" },
      serverTimestamp,
      notificationId: "space1_evt1",
    });
    // The path ends with the supplied id, not an auto-id, so a
    // re-delivery overwrites the same doc.
    expect(firestore._writes[0].path).toBe(
      "notifications/bob/items/space1_evt1"
    );
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

  it("anonymous: true keeps fromUserId OUT of the stored doc, self-check still applies", async () => {
    // SOCIAL-FOCUS-01: circle_focus_backed is anonymous BY DATA — the
    // recipient owns read on their notification docs, so anonymity
    // that only lives in UI copy would not be anonymity.
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();

    await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "bob",
      anonymous: true,
      data: {
        type: "circle_focus_backed",
        message: "A Circle member backed your weekly focus",
      },
      serverTimestamp,
    });
    expect(firestore._writes).toHaveLength(1);
    expect(firestore._writes[0].data).not.toHaveProperty("fromUserId");
    expect(firestore._writes[0].data.type).toBe("circle_focus_backed");

    // Self-notify no-op still works with anonymous (fromUid required).
    const self = await createNotification({
      firestore,
      fromUid: "bob",
      toUid: "bob",
      anonymous: true,
      data: { type: "circle_focus_backed", message: "x" },
      serverTimestamp,
    });
    expect(self.skipped).toBe(true);
    expect(firestore._writes).toHaveLength(1);
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

describe("SOC-P2g space-post engagement notifications", () => {
  /* These two types shipped BROKEN: the P2g callables emitted them while
     this module's allowlist didn't contain them, so createNotification
     threw on every call, the callables' best-effort catch swallowed it,
     and the feature was silently dead in production — with both halves'
     unit tests green, because nothing tested the composition. The suite
     below pins the composition, not just the units. */

  it("accepts both space-post types and stores the deep-link payload", async () => {
    const { createNotification } = require("../lib/socialFanout");
    for (const type of ["space_post_like", "space_post_comment"]) {
      const firestore = makeFirestoreStub();
      await createNotification({
        firestore,
        fromUid: "alice",
        toUid: "bob",
        data: {
          type,
          fromName: "Alice",
          spaceId: "race-london-marathon",
          postId: "post-abc123",
          message: "Alice gave your space post props",
        },
        serverTimestamp,
      });
      expect(firestore._writes).toHaveLength(1);
      const stored = firestore._writes[0].data;
      expect(stored.type).toBe(type);
      // The tray navigates via data.spaceId (useNotifications.ts parses
      // it; NotificationsSheet routes on it). The pre-fix sanitiser
      // dropped both fields, so even a valid type produced a row that
      // rendered but went nowhere.
      expect(stored.spaceId).toBe("race-london-marathon");
      expect(stored.postId).toBe("post-abc123");
      expect(stored.fromName).toBe("Alice");
    }
  });

  it("length-caps the deep-link fields", async () => {
    const { createNotification } = require("../lib/socialFanout");
    const firestore = makeFirestoreStub();
    await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "bob",
      data: {
        type: "space_post_like",
        spaceId: "x".repeat(500),
        postId: "y".repeat(500),
      },
      serverTimestamp,
    });
    const stored = firestore._writes[0].data;
    expect(stored.spaceId).toHaveLength(64);
    expect(stored.postId).toHaveLength(128);
  });

  it("COMPOSITION PIN: every type index.js emits is in the allowlist", () => {
    /* The test that would have caught the P2g break. Scans the real
       functions/index.js source for `type: "..."` inside every
       createNotification call's data block, and asserts each against the
       REAL exported allowlist. A new callable emitting a type this module
       does not know fails here, at unit speed, instead of shipping a
       notification path that throws into a best-effort catch forever.

       The window is bounded (800 chars) so the regex reads only the data
       block of the call, not unrelated `type:` fields further down. If a
       future call site legitimately exceeds it, widen the window — do NOT
       exempt the site. */
    const { readFileSync } = require("node:fs");
    const { join } = require("node:path");
    const { VALID_NOTIFICATION_TYPES } = require("../lib/socialFanout");
    const src = readFileSync(join(__dirname, "..", "index.js"), "utf8");

    const emitted = [];
    const callRe = /createNotification\(\{[\s\S]{0,800}?type:\s*"([a-z_]+)"/g;
    for (const m of src.matchAll(callRe)) emitted.push(m[1]);

    // Guard the scan itself: if the regex rots, this fails loudly instead
    // of the assertion below passing over an empty list.
    expect(emitted.length).toBeGreaterThanOrEqual(4);

    for (const type of emitted) {
      expect(
        VALID_NOTIFICATION_TYPES,
        `functions/index.js emits type "${type}" but socialFanout's ` +
          `VALID_NOTIFICATION_TYPES does not allow it — createNotification ` +
          `will throw into the caller's best-effort catch and the ` +
          `notification will be silently dropped in production.`
      ).toContain(type);
    }
  });
});

describe("createNotification — block backstop", () => {
  /* The interaction callables refuse a blocked kudos or comment outright, but
     they are not the only writers here: space post likes and comments,
     follows and circle events all reach createNotification too, and each new
     surface is another chance to forget the check. Guarding at the single
     point every notification passes through makes the rule true by
     construction rather than by remembering. */
  const serverTimestamp = () => "TS";

  it("skips a notification to someone who blocked the sender", async () => {
    const firestore = makeFirestoreStub({
      initial: { "blocks/recipient/users/sender": { at: 1 } },
    });
    const { createNotification } = require("../lib/socialFanout");
    const res = await createNotification({
      firestore,
      fromUid: "sender",
      toUid: "recipient",
      data: { type: "kudos", activityId: "a1" },
      serverTimestamp,
    });
    expect(res).toEqual({ skipped: true, blocked: true });
    // The point of the backstop: nothing was written.
    expect(firestore._writes).toHaveLength(0);
  });

  it("skips when the SENDER blocked the recipient", async () => {
    const firestore = makeFirestoreStub({
      initial: { "blocks/sender/users/recipient": { at: 1 } },
    });
    const { createNotification } = require("../lib/socialFanout");
    const res = await createNotification({
      firestore,
      fromUid: "sender",
      toUid: "recipient",
      data: { type: "comment", activityId: "a1" },
      serverTimestamp,
    });
    expect(res.blocked).toBe(true);
    expect(firestore._writes).toHaveLength(0);
  });

  it("still delivers when there is no block", async () => {
    /* Guards the guard: a backstop that skipped everything would satisfy both
       assertions above and silently disable all notifications — which is
       exactly what happened to this suite while the guard's read was
       throwing. */
    const firestore = makeFirestoreStub();
    const { createNotification } = require("../lib/socialFanout");
    const res = await createNotification({
      firestore,
      fromUid: "sender",
      toUid: "recipient",
      data: { type: "kudos", activityId: "a1" },
      serverTimestamp,
    });
    expect(res.blocked).toBeUndefined();
    expect(res.notificationId).toBeTruthy();
    expect(firestore._writes).toHaveLength(1);
  });
});

/**
 * Audit PR 2 — socialCounters helper tests.
 *
 * Pins counter-mutation atomicity for kudos, comments, and crew
 * membership. Each operation must:
 *   - Run inside a Firestore transaction (so contention re-runs are
 *     safe and counter delta + sub-doc state agree).
 *   - Validate the parent doc exists before mutating its counter.
 *   - Be idempotent under re-tap (toggleKudos flips; join/leave
 *     no-op when already in/out).
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const INC_TAG = "__INC__";
const TS_TAG = "__TS__";
const increment = (n) => ({ tag: INC_TAG, by: n });
const serverTimestamp = () => ({ tag: TS_TAG });

/**
 * Firestore stub: drives `collection().doc().collection().doc()`
 * chains, captures txn reads + writes per call site so tests can
 * assert atomicity.
 */
function makeFirestoreStub({ initial = {}, missingActivity = false } = {}) {
  // `initial` is keyed by a synthetic path so tests can pre-seed.
  // Paths: "activities/X", "kudos/X/users/U", "comments/X/items/C",
  // "groups/X", "groups/X/members/U".
  const state = { ...initial };
  const writes = [];
  const reads = [];

  function makeRef(path) {
    return {
      _path: path,
      id: path.split("/").pop(),
      collection(sub) {
        return makeCollection(`${path}/${sub}`);
      },
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
    };
  }

  const firestore = {
    collection(name) {
      return makeCollection(name);
    },
    runTransaction: vi.fn(async (cb) => {
      const txn = {
        get: vi.fn(async (ref) => {
          reads.push(ref._path);
          // Activity-missing shortcut for the "activity not found" tests.
          if (missingActivity && ref._path.startsWith("activities/")) {
            return { exists: false, data: () => null };
          }
          let data = state[ref._path];
          // The legacy counter-atomicity seeds pre-date the visibility gate
          // and set only the counter fields. Default such activity docs to a
          // PUBLIC activity authored by "bob" so assertCanInteractWithActivity
          // treats them as viewable; the visibility-specific behaviour is
          // covered by the dedicated access tests below (which seed an
          // explicit `visibility`, so this default never overrides them).
          if (
            data !== undefined &&
            ref._path.startsWith("activities/") &&
            data.visibility === undefined
          ) {
            data = { visibility: "public", authorId: "bob", ...data };
          }
          return {
            exists: data !== undefined,
            data: () => data,
          };
        }),
        set: vi.fn((ref, data) => {
          writes.push({ op: "set", path: ref._path, data });
          state[ref._path] = data;
        }),
        update: vi.fn((ref, data) => {
          writes.push({ op: "update", path: ref._path, data });
          state[ref._path] = { ...(state[ref._path] || {}), ...data };
        }),
        delete: vi.fn((ref) => {
          writes.push({ op: "delete", path: ref._path });
          delete state[ref._path];
        }),
      };
      return cb(txn);
    }),
    _state: state,
    _writes: writes,
    _reads: reads,
  };
  return firestore;
}

describe("toggleKudos", () => {
  it("Cycle 1 (tracer): no prior kudos → creates doc + increments counter", async () => {
    const { toggleKudos } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "activities/A1": { kudosCount: 5 } },
    });
    const result = await toggleKudos({
      firestore,
      uid: "alice",
      activityId: "A1",
      increment,
      serverTimestamp,
    });
    expect(result.kudosed).toBe(true);
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
    // Both ops in the same txn: kudos set + activity update
    const setOp = firestore._writes.find((w) => w.op === "set");
    const updateOp = firestore._writes.find((w) => w.op === "update");
    expect(setOp.path).toBe("kudos/A1/users/alice");
    expect(updateOp.path).toBe("activities/A1");
    expect(updateOp.data.kudosCount).toEqual({ tag: INC_TAG, by: 1 });
  });

  it("Cycle 2: existing kudos → deletes doc + decrements counter", async () => {
    const { toggleKudos } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: {
        "activities/A1": { kudosCount: 5 },
        "kudos/A1/users/alice": { createdAt: 12345 },
      },
    });
    const result = await toggleKudos({
      firestore,
      uid: "alice",
      activityId: "A1",
      increment,
      serverTimestamp,
    });
    expect(result.kudosed).toBe(false);
    const deleteOp = firestore._writes.find((w) => w.op === "delete");
    const updateOp = firestore._writes.find((w) => w.op === "update");
    expect(deleteOp.path).toBe("kudos/A1/users/alice");
    expect(updateOp.data.kudosCount).toEqual({ tag: INC_TAG, by: -1 });
  });

  it("Cycle 3: missing activity → throws (counter integrity)", async () => {
    const { toggleKudos } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({ missingActivity: true });
    await expect(
      toggleKudos({
        firestore,
        uid: "alice",
        activityId: "missing",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/activity-not-accessible/);
  });

  it("Cycle 4: required-args validation", async () => {
    const { toggleKudos } = require("../lib/socialCounters");
    await expect(toggleKudos({})).rejects.toThrow(/required/);
    await expect(toggleKudos({ firestore: {}, uid: "x" })).rejects.toThrow(
      /required/
    );
  });
});

describe("addComment", () => {
  it("Cycle 1 (tracer): valid comment creates doc + increments commentCount", async () => {
    const { addComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "activities/A1": { commentCount: 2 } },
    });
    const result = await addComment({
      firestore,
      uid: "alice",
      activityId: "A1",
      text: "Nice run!",
      authorName: "Alice",
      increment,
      serverTimestamp,
    });
    expect(result.commentId).toMatch(/^auto-/);
    const setOp = firestore._writes.find((w) => w.op === "set");
    expect(setOp.path).toMatch(/^comments\/A1\/items\/auto-/);
    expect(setOp.data.authorId).toBe("alice");
    expect(setOp.data.text).toBe("Nice run!");
    expect(setOp.data.authorName).toBe("Alice");
    const updateOp = firestore._writes.find((w) => w.op === "update");
    expect(updateOp.data.commentCount).toEqual({ tag: INC_TAG, by: 1 });
  });

  it("Cycle 2: blank text → rejected", async () => {
    const { addComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "activities/A1": { commentCount: 0 } },
    });
    await expect(
      addComment({
        firestore,
        uid: "alice",
        activityId: "A1",
        text: "   ",
        authorName: "Alice",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/1-1000 chars/);
  });

  it("Cycle 3: oversized text (>1000) → rejected", async () => {
    const { addComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "activities/A1": { commentCount: 0 } },
    });
    await expect(
      addComment({
        firestore,
        uid: "alice",
        activityId: "A1",
        text: "x".repeat(1001),
        authorName: "Alice",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/1-1000 chars/);
  });

  it("Cycle 4: text is trimmed before storage", async () => {
    const { addComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "activities/A1": { commentCount: 0 } },
    });
    await addComment({
      firestore,
      uid: "alice",
      activityId: "A1",
      text: "  hello  ",
      authorName: "Alice",
      increment,
      serverTimestamp,
    });
    const setOp = firestore._writes.find((w) => w.op === "set");
    expect(setOp.data.text).toBe("hello");
  });

  it("Cycle 5: missing activity → throws", async () => {
    const { addComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({ missingActivity: true });
    await expect(
      addComment({
        firestore,
        uid: "alice",
        activityId: "missing",
        text: "hi",
        authorName: "Alice",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/activity-not-accessible/);
  });

  it("Cycle 6: authorPhotoURL persisted when present", async () => {
    const { addComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "activities/A1": { commentCount: 0 } },
    });
    await addComment({
      firestore,
      uid: "alice",
      activityId: "A1",
      text: "hi",
      authorName: "Alice",
      authorPhotoURL: "https://example.com/a.png",
      increment,
      serverTimestamp,
    });
    const setOp = firestore._writes.find((w) => w.op === "set");
    expect(setOp.data.authorPhotoURL).toBe("https://example.com/a.png");
  });
});

describe("deleteComment", () => {
  it("Cycle 1 (tracer): owner can delete + counter decremented", async () => {
    const { deleteComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: {
        "activities/A1": { commentCount: 3 },
        "comments/A1/items/C1": { authorId: "alice", text: "hi" },
      },
    });
    await deleteComment({
      firestore,
      uid: "alice",
      activityId: "A1",
      commentId: "C1",
      increment,
    });
    const deleteOp = firestore._writes.find((w) => w.op === "delete");
    const updateOp = firestore._writes.find((w) => w.op === "update");
    expect(deleteOp.path).toBe("comments/A1/items/C1");
    expect(updateOp.data.commentCount).toEqual({ tag: INC_TAG, by: -1 });
  });

  it("Cycle 2: non-owner cannot delete", async () => {
    const { deleteComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: {
        "activities/A1": { commentCount: 3 },
        "comments/A1/items/C1": { authorId: "alice", text: "hi" },
      },
    });
    await expect(
      deleteComment({
        firestore,
        uid: "mallory",
        activityId: "A1",
        commentId: "C1",
        increment,
      })
    ).rejects.toThrow(/not authorized/);
  });

  it("Cycle 3: missing comment → throws", async () => {
    const { deleteComment } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "activities/A1": { commentCount: 0 } },
    });
    await expect(
      deleteComment({
        firestore,
        uid: "alice",
        activityId: "A1",
        commentId: "ghost",
        increment,
      })
    ).rejects.toThrow(/comment ghost not found/);
  });
});

describe("setCrewMembership", () => {
  it("Cycle 1 (tracer): join creates member doc + increments memberCount", async () => {
    const { setCrewMembership } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "groups/crew-a": { memberCount: 10 } },
    });
    await setCrewMembership({
      firestore,
      uid: "alice",
      crewId: "crew-a",
      action: "join",
      displayName: "Alice",
      increment,
      serverTimestamp,
    });
    const setOp = firestore._writes.find((w) => w.op === "set");
    const updateOp = firestore._writes.find((w) => w.op === "update");
    expect(setOp.path).toBe("groups/crew-a/members/alice");
    expect(setOp.data.displayName).toBe("Alice");
    expect(updateOp.data.memberCount).toEqual({ tag: INC_TAG, by: 1 });
  });

  it("Cycle 2: join is idempotent (already-member → no counter change)", async () => {
    const { setCrewMembership } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: {
        "groups/crew-a": { memberCount: 10 },
        "groups/crew-a/members/alice": { joinedAt: 12345 },
      },
    });
    await setCrewMembership({
      firestore,
      uid: "alice",
      crewId: "crew-a",
      action: "join",
      displayName: "Alice",
      increment,
      serverTimestamp,
    });
    expect(firestore._writes).toHaveLength(0);
  });

  it("Cycle 3: leave deletes member doc + decrements memberCount", async () => {
    const { setCrewMembership } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: {
        "groups/crew-a": { memberCount: 10 },
        "groups/crew-a/members/alice": { joinedAt: 12345 },
      },
    });
    await setCrewMembership({
      firestore,
      uid: "alice",
      crewId: "crew-a",
      action: "leave",
      increment,
      serverTimestamp,
    });
    const deleteOp = firestore._writes.find((w) => w.op === "delete");
    const updateOp = firestore._writes.find((w) => w.op === "update");
    expect(deleteOp.path).toBe("groups/crew-a/members/alice");
    expect(updateOp.data.memberCount).toEqual({ tag: INC_TAG, by: -1 });
  });

  it("Cycle 4: leave is idempotent (already-not-member → no counter change)", async () => {
    const { setCrewMembership } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "groups/crew-a": { memberCount: 10 } },
    });
    await setCrewMembership({
      firestore,
      uid: "alice",
      crewId: "crew-a",
      action: "leave",
      increment,
      serverTimestamp,
    });
    expect(firestore._writes).toHaveLength(0);
  });

  it("Cycle 5: invalid action throws", async () => {
    const { setCrewMembership } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({
      initial: { "groups/crew-a": { memberCount: 10 } },
    });
    await expect(
      setCrewMembership({
        firestore,
        uid: "alice",
        crewId: "crew-a",
        action: "bounce",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/action must be 'join' or 'leave'/);
  });

  it("Cycle 6: missing crew → throws", async () => {
    const { setCrewMembership } = require("../lib/socialCounters");
    const firestore = makeFirestoreStub({ initial: {} });
    await expect(
      setCrewMembership({
        firestore,
        uid: "alice",
        crewId: "ghost",
        action: "join",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/crew ghost not found/);
  });
});

// Packet 13 — kudos/comment/delete must obey the parent activity's
// visibility. The gate runs INSIDE the txn; a denied interaction records no
// writes.
describe("socialCounters — activity visibility gate", () => {
  const {
    toggleKudos,
    addComment,
    deleteComment,
  } = require("../lib/socialCounters");

  it("kudos: a stranger cannot kudos a PRIVATE activity (no writes)", async () => {
    const firestore = makeFirestoreStub({
      initial: {
        "activities/P1": {
          kudosCount: 0,
          visibility: "private",
          authorId: "bob",
        },
      },
    });
    await expect(
      toggleKudos({
        firestore,
        uid: "mallory",
        activityId: "P1",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/activity-not-accessible/);
    expect(firestore._writes).toHaveLength(0);
  });

  it("kudos: the OWNER can kudos their own private activity", async () => {
    const firestore = makeFirestoreStub({
      initial: {
        "activities/P1": {
          kudosCount: 0,
          visibility: "private",
          authorId: "bob",
        },
      },
    });
    const result = await toggleKudos({
      firestore,
      uid: "bob",
      activityId: "P1",
      increment,
      serverTimestamp,
    });
    expect(result.kudosed).toBe(true);
    expect(result.activityAuthorId).toBe("bob");
  });

  it("kudos: a follower CAN kudos a followers-only activity; a former follower cannot", async () => {
    const base = {
      "activities/F1": {
        kudosCount: 0,
        visibility: "followers",
        authorId: "bob",
      },
    };
    const follower = makeFirestoreStub({
      initial: { ...base, "followers/bob/users/carol": { since: 1 } },
    });
    const okRes = await toggleKudos({
      firestore: follower,
      uid: "carol",
      activityId: "F1",
      increment,
      serverTimestamp,
    });
    expect(okRes.kudosed).toBe(true);
    expect(okRes.activityAuthorId).toBe("bob");

    const stranger = makeFirestoreStub({ initial: { ...base } });
    await expect(
      toggleKudos({
        firestore: stranger,
        uid: "dave",
        activityId: "F1",
        increment,
        serverTimestamp,
      })
    ).rejects.toThrow(/activity-not-accessible/);
    expect(stranger._writes).toHaveLength(0);
  });

  it("comment: returns the verified activityAuthorId for the notification", async () => {
    const firestore = makeFirestoreStub({
      initial: {
        "activities/A1": {
          commentCount: 0,
          visibility: "public",
          authorId: "bob",
        },
      },
    });
    const result = await addComment({
      firestore,
      uid: "alice",
      activityId: "A1",
      text: "nice",
      authorName: "Alice",
      increment,
      serverTimestamp,
    });
    expect(result.activityAuthorId).toBe("bob");
  });

  it("deleteComment: a former follower cannot delete their comment on a now-private activity (no writes)", async () => {
    // carol commented while it was followers-visible; bob made it private and
    // removed her. Her author-owned delete must still be denied on access.
    const firestore = makeFirestoreStub({
      initial: {
        "activities/P1": {
          commentCount: 1,
          visibility: "private",
          authorId: "bob",
        },
        "comments/P1/items/C1": { authorId: "carol", text: "hi" },
      },
    });
    await expect(
      deleteComment({
        firestore,
        uid: "carol",
        activityId: "P1",
        commentId: "C1",
        increment,
      })
    ).rejects.toThrow(/activity-not-accessible/);
    expect(firestore._writes).toHaveLength(0);
  });
});

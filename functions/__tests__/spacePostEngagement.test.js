/**
 * SOC-P2c — space-post like toggle. Pins the counter-lockdown
 * contract (the socialCounters discipline applied to Space posts):
 * like sub-doc + likeCount flip in ONE transaction, doc id is the
 * liker uid (idempotent per user), missing posts throw the coded
 * access error, and the delta always matches the sub-doc edge.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  toggleSpacePostLike,
  POST_NOT_ACCESSIBLE,
} = require("../lib/spacePostEngagement");

const INC_TAG = "__INC__";
const increment = (n) => ({ tag: INC_TAG, by: n });
const serverTimestamp = () => ({ tag: "__TS__" });

/** Minimal Firestore stub — same shape as socialCounters.test.js. */
function makeFirestoreStub({ initial = {} } = {}) {
  const state = { ...initial };
  const writes = [];
  function makeRef(path) {
    return {
      _path: path,
      id: path.split("/").pop(),
      collection: (sub) => makeCollection(`${path}/${sub}`),
    };
  }
  function makeCollection(path) {
    return { _path: path, doc: (id) => makeRef(`${path}/${id}`) };
  }
  return {
    collection: (name) => makeCollection(name),
    runTransaction: vi.fn(async (cb) =>
      cb({
        get: vi.fn(async (ref) => {
          const data = state[ref._path];
          return { exists: data !== undefined, data: () => data };
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
      })
    ),
    _state: state,
    _writes: writes,
  };
}

const POST = "spaces/runners/posts/coach-2026-07-20";
const LIKE = `${POST}/likes/alice`;

describe("toggleSpacePostLike", () => {
  it("no prior like → creates the uid-keyed doc + increments in one txn", async () => {
    const firestore = makeFirestoreStub({
      initial: { [POST]: { authorId: "tropos-coach", likeCount: 2 } },
    });
    const result = await toggleSpacePostLike({
      firestore,
      uid: "alice",
      spaceId: "runners",
      postId: "coach-2026-07-20",
      increment,
      serverTimestamp,
    });
    expect(result).toEqual({ liked: true, postAuthorId: "tropos-coach" });
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
    expect(firestore._writes).toEqual([
      { op: "set", path: LIKE, data: { createdAt: { tag: "__TS__" } } },
      {
        op: "update",
        path: POST,
        data: { likeCount: { tag: INC_TAG, by: 1 } },
      },
    ]);
  });

  it("existing like → deletes the doc + decrements (re-tap idempotence)", async () => {
    const firestore = makeFirestoreStub({
      initial: {
        [POST]: { authorId: "bob", likeCount: 3 },
        [LIKE]: { createdAt: 1 },
      },
    });
    const result = await toggleSpacePostLike({
      firestore,
      uid: "alice",
      spaceId: "runners",
      postId: "coach-2026-07-20",
      increment,
      serverTimestamp,
    });
    expect(result).toEqual({ liked: false, postAuthorId: "bob" });
    expect(firestore._writes).toEqual([
      { op: "delete", path: LIKE },
      {
        op: "update",
        path: POST,
        data: { likeCount: { tag: INC_TAG, by: -1 } },
      },
    ]);
  });

  it("double toggle returns to the original state", async () => {
    const firestore = makeFirestoreStub({
      initial: { [POST]: { authorId: "bob", likeCount: 0 } },
    });
    const args = {
      firestore,
      uid: "alice",
      spaceId: "runners",
      postId: "coach-2026-07-20",
      increment,
      serverTimestamp,
    };
    await toggleSpacePostLike(args);
    await toggleSpacePostLike(args);
    expect(firestore._state[LIKE]).toBeUndefined();
  });

  it("missing post throws the coded access error, writes NOTHING", async () => {
    const firestore = makeFirestoreStub();
    await expect(
      toggleSpacePostLike({
        firestore,
        uid: "alice",
        spaceId: "runners",
        postId: "nope",
        increment,
        serverTimestamp,
      })
    ).rejects.toMatchObject({ code: POST_NOT_ACCESSIBLE });
    expect(firestore._writes).toEqual([]);
  });

  it("rejects missing args before touching Firestore", async () => {
    const firestore = makeFirestoreStub();
    await expect(
      toggleSpacePostLike({
        firestore,
        uid: "",
        spaceId: "runners",
        postId: "x",
      })
    ).rejects.toThrow(/required/);
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
});

const {
  addSpacePostComment,
  deleteSpacePostComment,
} = require("../lib/spacePostEngagement");

describe("addSpacePostComment", () => {
  it("creates the comment + increments commentCount in one txn", async () => {
    const firestore = makeFirestoreStub({
      initial: { [POST]: { authorId: "bob", commentCount: 1 } },
    });
    const result = await addSpacePostComment({
      firestore,
      uid: "alice",
      spaceId: "runners",
      postId: "coach-2026-07-20",
      text: "  Loving this block  ",
      authorName: "Alice",
      increment,
      serverTimestamp,
    });
    expect(result.postAuthorId).toBe("bob");
    expect(typeof result.commentId).toBe("string");
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
    const [setWrite, countWrite] = firestore._writes;
    expect(setWrite.op).toBe("set");
    expect(setWrite.path.startsWith(`${POST}/comments/`)).toBe(true);
    // Trimmed text, capped name, no undefined photo field.
    expect(setWrite.data.text).toBe("Loving this block");
    expect(setWrite.data.authorId).toBe("alice");
    expect("authorPhotoURL" in setWrite.data).toBe(false);
    expect(countWrite).toEqual({
      op: "update",
      path: POST,
      data: { commentCount: { tag: INC_TAG, by: 1 } },
    });
  });

  it("rejects empty and over-long text before any write", async () => {
    const firestore = makeFirestoreStub({
      initial: { [POST]: { authorId: "bob", commentCount: 0 } },
    });
    const base = {
      firestore,
      uid: "alice",
      spaceId: "runners",
      postId: "coach-2026-07-20",
      authorName: "Alice",
      increment,
      serverTimestamp,
    };
    await expect(addSpacePostComment({ ...base, text: "   " })).rejects.toThrow(
      /1-1000/
    );
    await expect(
      addSpacePostComment({ ...base, text: "x".repeat(1001) })
    ).rejects.toThrow(/1-1000/);
    expect(firestore._writes).toEqual([]);
  });

  it("missing post throws the coded access error, writes NOTHING", async () => {
    const firestore = makeFirestoreStub();
    await expect(
      addSpacePostComment({
        firestore,
        uid: "alice",
        spaceId: "runners",
        postId: "nope",
        text: "hi",
        authorName: "Alice",
        increment,
        serverTimestamp,
      })
    ).rejects.toMatchObject({ code: POST_NOT_ACCESSIBLE });
    expect(firestore._writes).toEqual([]);
  });
});

describe("deleteSpacePostComment", () => {
  const COMMENT = `${POST}/comments/c1`;

  it("author deletes their comment + decrements in one txn", async () => {
    const firestore = makeFirestoreStub({
      initial: {
        [POST]: { authorId: "bob", commentCount: 2 },
        [COMMENT]: { authorId: "alice", text: "hi" },
      },
    });
    await deleteSpacePostComment({
      firestore,
      uid: "alice",
      spaceId: "runners",
      postId: "coach-2026-07-20",
      commentId: "c1",
      increment,
    });
    expect(firestore._writes).toEqual([
      { op: "delete", path: COMMENT },
      {
        op: "update",
        path: POST,
        data: { commentCount: { tag: INC_TAG, by: -1 } },
      },
    ]);
  });

  it("a NON-author cannot delete (no writes land)", async () => {
    const firestore = makeFirestoreStub({
      initial: {
        [POST]: { authorId: "bob", commentCount: 2 },
        [COMMENT]: { authorId: "alice", text: "hi" },
      },
    });
    await expect(
      deleteSpacePostComment({
        firestore,
        uid: "mallory",
        spaceId: "runners",
        postId: "coach-2026-07-20",
        commentId: "c1",
        increment,
      })
    ).rejects.toThrow(/not authorized/);
    expect(firestore._writes).toEqual([]);
  });
});

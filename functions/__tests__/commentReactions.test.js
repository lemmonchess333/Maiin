import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  toggleCommentReaction,
  REACTION_KEYS,
} = require("../lib/commentReactions");

/**
 * Firestore stub: a comment doc + its parent activity, transactional get/set.
 * Reads are path-aware (activity vs comment vs follower) because reacting now
 * enforces the parent activity's visibility inside the txn (packet 13). The
 * activity defaults to PUBLIC so the existing reaction tests pass the gate;
 * `activityData` / `followers` are overridable for the access tests.
 */
function makeFirestore(
  initialData,
  {
    activityData = { visibility: "public", authorId: "bob" },
    followers = {},
  } = {}
) {
  let stored = initialData;
  const activityRef = { _kind: "activity" };
  const commentRef = { _kind: "comment" };
  return {
    data: () => stored,
    collection: (name) => {
      if (name === "activities") {
        return { doc: () => activityRef };
      }
      if (name === "followers") {
        return {
          doc: (authorId) => ({
            collection: () => ({
              doc: (uid) => ({ _kind: "follower", _key: `${authorId}/${uid}` }),
            }),
          }),
        };
      }
      // comments/{activityId}/items/{commentId}
      return { doc: () => ({ collection: () => ({ doc: () => commentRef }) }) };
    },
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => {
          if (ref && ref._kind === "activity") {
            return { exists: activityData !== null, data: () => activityData };
          }
          if (ref && ref._kind === "follower") {
            return { exists: followers[ref._key] === true };
          }
          return { exists: stored !== null, data: () => stored };
        },
        set: (_ref, value, opts) => {
          if (opts && opts.merge) {
            stored = {
              ...(stored || {}),
              ...value,
              reactions: {
                ...((stored && stored.reactions) || {}),
                ...(value.reactions || {}),
              },
            };
          } else {
            stored = value;
          }
        },
      }),
  };
}

const args = (firestore, overrides = {}) => ({
  firestore,
  uid: "u1",
  activityId: "a1",
  commentId: "c1",
  reaction: "muscle",
  ...overrides,
});

describe("toggleCommentReaction", () => {
  it("adds the uid on first toggle", async () => {
    const fs = makeFirestore({ text: "nice" });
    const res = await toggleCommentReaction(args(fs));
    expect(res).toEqual({ reacted: true, count: 1 });
    expect(fs.data().reactions.muscle).toEqual(["u1"]);
  });

  it("removes the uid on second toggle (idempotent per user)", async () => {
    const fs = makeFirestore({ reactions: { muscle: ["u1"] } });
    const res = await toggleCommentReaction(args(fs));
    expect(res).toEqual({ reacted: false, count: 0 });
    expect(fs.data().reactions.muscle).toEqual([]);
  });

  it("preserves the OTHER reaction key on write (merge, no clobber)", async () => {
    const fs = makeFirestore({ reactions: { fire: ["u9"] } });
    await toggleCommentReaction(args(fs));
    expect(fs.data().reactions.fire).toEqual(["u9"]);
    expect(fs.data().reactions.muscle).toEqual(["u1"]);
  });

  it("appends alongside other users' reactions", async () => {
    const fs = makeFirestore({ reactions: { muscle: ["u2", "u3"] } });
    const res = await toggleCommentReaction(args(fs));
    expect(res).toEqual({ reacted: true, count: 3 });
    expect(fs.data().reactions.muscle).toEqual(["u2", "u3", "u1"]);
  });

  it("rejects an unknown reaction key", async () => {
    const fs = makeFirestore({});
    await expect(
      toggleCommentReaction(args(fs, { reaction: "heart" }))
    ).rejects.toThrow("invalid-reaction");
  });

  it("rejects a missing comment", async () => {
    const fs = makeFirestore(null);
    await expect(toggleCommentReaction(args(fs))).rejects.toThrow(
      "comment-not-found"
    );
  });

  it("exports exactly the two sanctioned reactions", () => {
    expect(REACTION_KEYS).toEqual(["muscle", "fire"]);
  });

  // Packet 13 — reacting obeys the parent activity's visibility.
  it("rejects a reaction on a PRIVATE activity by a non-owner (no write)", async () => {
    const fs = makeFirestore(
      { text: "secret" },
      { activityData: { visibility: "private", authorId: "bob" } }
    );
    await expect(
      toggleCommentReaction(args(fs, { uid: "mallory" }))
    ).rejects.toThrow("activity-not-accessible");
    // Comment doc untouched.
    expect(fs.data()).toEqual({ text: "secret" });
  });

  it("allows a follower to react on a followers-only activity", async () => {
    const fs = makeFirestore(
      { text: "hi" },
      {
        activityData: { visibility: "followers", authorId: "bob" },
        followers: { "bob/carol": true },
      }
    );
    const res = await toggleCommentReaction(args(fs, { uid: "carol" }));
    expect(res).toEqual({ reacted: true, count: 1 });
  });

  it("rejects a former follower on a followers-only activity", async () => {
    const fs = makeFirestore(
      { text: "hi" },
      {
        activityData: { visibility: "followers", authorId: "bob" },
        followers: {},
      }
    );
    await expect(
      toggleCommentReaction(args(fs, { uid: "dave" }))
    ).rejects.toThrow("activity-not-accessible");
  });

  it("rejects when the parent activity is missing", async () => {
    const fs = makeFirestore({ text: "hi" }, { activityData: null });
    await expect(toggleCommentReaction(args(fs))).rejects.toThrow(
      "activity-not-accessible"
    );
  });
});

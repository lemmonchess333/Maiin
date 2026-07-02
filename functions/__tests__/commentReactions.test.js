import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  toggleCommentReaction,
  REACTION_KEYS,
} = require("../lib/commentReactions");

/** Minimal firestore stub: one comment doc, transactional get/set. */
function makeFirestore(initialData) {
  let stored = initialData;
  const ref = {};
  return {
    data: () => stored,
    collection: () => ({
      doc: () => ({
        collection: () => ({ doc: () => ref }),
      }),
    }),
    runTransaction: async (fn) =>
      fn({
        get: async () => ({
          exists: stored !== null,
          data: () => stored,
        }),
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
});

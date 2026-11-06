import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { memoryFirestore, increment } = require("./helpers/memoryFirestore.cjs");
const { toggleCommentReaction } = require("../lib/commentReactions");
const {
  toggleSpacePostLike,
  addSpacePostComment,
} = require("../lib/spacePostEngagement");
const {
  toggleKudos,
  addComment,
  deleteComment,
} = require("../lib/socialCounters");
const cases = [
  [
    "activity kudos",
    "owner",
    (fs) =>
      toggleKudos({
        firestore: fs,
        uid: "actor",
        activityId: "a",
        increment,
        serverTimestamp: () => 0,
      }),
    "activity-not-accessible",
  ],
  [
    "activity comment",
    "owner",
    (fs) =>
      addComment({
        firestore: fs,
        uid: "actor",
        activityId: "a",
        text: "hello",
        increment,
        serverTimestamp: () => 0,
      }),
    "activity-not-accessible",
  ],
  [
    "activity author reaction",
    "owner",
    (fs) =>
      toggleCommentReaction({
        firestore: fs,
        uid: "actor",
        activityId: "a",
        commentId: "c",
        reaction: "muscle",
      }),
    "activity-not-accessible",
  ],
  [
    "comment author reaction",
    "commenter",
    (fs) =>
      toggleCommentReaction({
        firestore: fs,
        uid: "actor",
        activityId: "a",
        commentId: "c",
        reaction: "muscle",
      }),
    "activity-not-accessible",
  ],
  [
    "space like",
    "owner",
    (fs) =>
      toggleSpacePostLike({
        firestore: fs,
        uid: "actor",
        spaceId: "s",
        postId: "p",
        increment,
        serverTimestamp: () => 0,
      }),
    "space-post-not-accessible",
  ],
  [
    "space comment",
    "owner",
    (fs) =>
      addSpacePostComment({
        firestore: fs,
        uid: "actor",
        spaceId: "s",
        postId: "p",
        text: "hello",
        increment,
        serverTimestamp: () => 0,
      }),
    "space-post-not-accessible",
  ],
];
const seed = {
  "activities/a": { authorId: "owner", visibility: "public" },
  "comments/a/items/c": { authorId: "commenter", text: "hi" },
  "spaces/s/posts/p": { authorId: "owner", likeCount: 0, commentCount: 0 },
};
describe("transactional block enforcement", () => {
  it("preserves removal of your own activity comment after a block", async () => {
    const fs = memoryFirestore({
      ...seed,
      "comments/a/items/c": { authorId: "actor", text: "hi" },
      "blocks/owner/users/actor": {},
    });
    await deleteComment({
      firestore: fs,
      uid: "actor",
      activityId: "a",
      commentId: "c",
      increment,
    });
    expect(fs.data.has("comments/a/items/c")).toBe(false);
  });
  for (const [name, target, run, code] of cases) {
    for (const direction of ["incoming", "outgoing"])
      it(`${name}: refuses ${direction} block without writes`, async () => {
        const path =
          direction === "incoming"
            ? `blocks/${target}/users/actor`
            : `blocks/actor/users/${target}`;
        const fs = memoryFirestore({ ...seed, [path]: {} });
        await expect(run(fs)).rejects.toMatchObject({ code });
        expect(fs.operations).toEqual([]);
      });
    it(`${name}: allows unrelated users`, async () => {
      const fs = memoryFirestore(seed);
      await run(fs);
      expect(fs.operations.length).toBeGreaterThan(0);
    });
    it(`${name}: fails closed on block read failure`, async () => {
      const fs = memoryFirestore(seed);
      fs.failures.set(`get:blocks/${target}/users/actor`, new Error("offline"));
      await expect(run(fs)).rejects.toThrow();
      expect(fs.operations).toEqual([]);
    });
  }
});

/**
 * One comment limit: the box the app draws, and both comment callables.
 *
 * The comment box stops at COMMENT_MAX_CHARS (src/lib/commentLimit.ts,
 * the input's maxLength). The callables refuse past MAX_COMMENT_LENGTH
 * (functions/lib/commentLimit.js), activity comments in
 * socialCounters.addComment and Space post comments in
 * spacePostEngagement.addSpacePostComment, and commentRejection names the
 * limit in what the person reads. If the box let more through than the
 * server takes, a comment typed in full is refused; the engines are driven
 * here, not read, so a literal written back into one of them fails too.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { COMMENT_MAX_CHARS } from "@/lib/commentLimit";

const require = createRequire(import.meta.url);
const { MAX_COMMENT_LENGTH } =
  require("../../../functions/lib/commentLimit.js") as {
    MAX_COMMENT_LENGTH: number;
  };
const { addComment } = require("../../../functions/lib/socialCounters.js");
const {
  addSpacePostComment,
} = require("../../../functions/lib/spacePostEngagement.js");
const {
  commentRejection,
} = require("../../../functions/lib/commentRejection.js");
const {
  memoryFirestore,
} = require("../../../functions/__tests__/helpers/memoryFirestore.cjs");

const sentinels = {
  increment: (n: number) => n,
  serverTimestamp: () => "now",
};

/** Comments `text` on a public activity and on a Space post. */
function commentBoth(text: string) {
  const firestore = memoryFirestore({
    "activities/a1": { authorId: "bob", visibility: "public" },
    "spaces/runners/posts/p1": { authorId: "bob", commentCount: 0 },
  });
  return [
    addComment({
      firestore,
      uid: "alice",
      activityId: "a1",
      text,
      authorName: "Alice",
      ...sentinels,
    }),
    addSpacePostComment({
      firestore,
      uid: "alice",
      spaceId: "runners",
      postId: "p1",
      text,
      authorName: "Alice",
      ...sentinels,
    }),
  ];
}

/** HttpsError as firebase-functions builds it, enough for the mapping. */
class HttpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

describe("comment limit — the box and both callables agree", () => {
  it("the server's limit is the box's", () => {
    expect(MAX_COMMENT_LENGTH).toBe(COMMENT_MAX_CHARS);
  });

  it("a comment that fills the box is taken by both callables", async () => {
    for (const write of commentBoth("a".repeat(COMMENT_MAX_CHARS))) {
      await expect(write).resolves.toHaveProperty("commentId");
    }
  });

  it("one past the box is refused by both, in words that name the box's limit", async () => {
    for (const write of commentBoth("a".repeat(COMMENT_MAX_CHARS + 1))) {
      const err = await write.then(
        () => null,
        (e: unknown) => e
      );
      expect(err).toBeInstanceOf(Error);
      const told = commentRejection(err, {
        functions: { https: { HttpsError } },
      });
      expect(told.code).toBe("failed-precondition");
      expect(told.message).toBe(
        `Write a comment of up to ${COMMENT_MAX_CHARS.toLocaleString("en-GB")} characters.`
      );
    }
  });
});

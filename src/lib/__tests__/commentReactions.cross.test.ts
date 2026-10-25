/**
 * Comment reactions: the ones the app offers, the ones the callable takes,
 * and the ones account deletion can find.
 *
 * CommentSheet draws a button per COMMENT_REACTIONS (src/lib/socialApi.ts);
 * toggleCommentReactionCallable refuses a reaction outside REACTION_KEYS
 * (functions/lib/commentReactions.js), so a button the server does not
 * know fails on every tap. Deleting an account takes the person's
 * reactions back with an array-contains query per key over both comment
 * groups (accountDeletionSocial.js), which Firestore answers only with a
 * collection-group index on that field: a key without one leaves a deleted
 * person's uid on every comment they reacted to.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { COMMENT_REACTIONS } from "@/lib/socialApi";

const require = createRequire(import.meta.url);
const {
  REACTION_KEYS,
  toggleCommentReaction,
} = require("../../../functions/lib/commentReactions.js");
const {
  memoryFirestore,
} = require("../../../functions/__tests__/helpers/memoryFirestore.cjs");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface FieldOverride {
  collectionGroup: string;
  fieldPath: string;
  indexes?: { queryScope?: string; arrayConfig?: string }[];
}

/** The reaction fields with a collection-group array index, per group. */
function indexedReactions(overrides: FieldOverride[], group: string) {
  return overrides
    .filter(
      (o) =>
        o.collectionGroup === group &&
        o.fieldPath.startsWith("reactions.") &&
        (o.indexes ?? []).some(
          (i) =>
            i.queryScope === "COLLECTION_GROUP" && i.arrayConfig === "CONTAINS"
        )
    )
    .map((o) => o.fieldPath.slice("reactions.".length))
    .sort();
}

describe("comment reactions — the app, the callable and deletion agree", () => {
  it("the app offers exactly the reactions the callable takes", () => {
    expect([...COMMENT_REACTIONS].sort()).toEqual([...REACTION_KEYS].sort());
  });

  it("the callable takes each one the app offers", async () => {
    for (const reaction of COMMENT_REACTIONS) {
      const firestore = memoryFirestore({
        "activities/a1": { authorId: "bob", visibility: "public" },
        "comments/a1/items/c1": { authorId: "bob", text: "Nice" },
      });
      await expect(
        toggleCommentReaction({
          firestore,
          uid: "alice",
          activityId: "a1",
          commentId: "c1",
          reaction,
        })
      ).resolves.toMatchObject({ reacted: true, count: 1 });
    }
  });

  it("every reaction has the index deletion's query needs, in both comment groups", () => {
    const { fieldOverrides } = JSON.parse(
      readFileSync(resolve(repoRoot, "firestore.indexes.json"), "utf8")
    ) as { fieldOverrides: FieldOverride[] };
    const keys = [...REACTION_KEYS].sort();
    // Activity comments live in `items`, Space post comments in `comments`.
    expect(indexedReactions(fieldOverrides, "items")).toEqual(keys);
    expect(indexedReactions(fieldOverrides, "comments")).toEqual(keys);
  });

  it("reads a reaction on one side only as a mismatch", () => {
    // Guards the guard: the lists are not compared over nothing.
    expect(REACTION_KEYS.length).toBeGreaterThan(1);
    expect([...COMMENT_REACTIONS, "clap"].sort()).not.toEqual(
      [...REACTION_KEYS].sort()
    );
  });
});

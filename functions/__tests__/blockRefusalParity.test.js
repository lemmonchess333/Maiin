/**
 * A blocked interaction is refused exactly as one on an activity the
 * caller cannot see (lib/blockGuard.js).
 *
 * Props and comments checked the block first and threw "This content isn't
 * available." (permission-denied), while a private or missing activity got
 * "This activity is unavailable." — and, for a comment, a different code,
 * which the app turns into different words on screen. Two answers told the
 * person blocked that the activity exists and that its author blocked them.
 *
 * Also pinned here, for the props, like and reaction toggles: an engine's
 * own message never reaches the person (lib/engagementRejection.js), and an
 * id that is not one document's is refused before anything is read.
 *
 * Collaborators are swapped on the module objects index.js calls through;
 * the activity read goes to the memory store.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const restriction = require("../lib/restriction");
const rateLimiter = require("../rateLimiter");
const blockGuard = require("../lib/blockGuard");
const socialCounters = require("../lib/socialCounters");
const socialFanout = require("../lib/socialFanout");
const commentReactions = require("../lib/commentReactions");
const spacePostEngagement = require("../lib/spacePostEngagement");
const {
  toggleKudosCallable,
  addCommentCallable,
  toggleCommentReactionCallable,
  toggleSpacePostLikeCallable,
} = require("../index");
const db = require("firebase-admin").firestore();

const ME = "blocked-person";
const CONTEXT = { auth: { uid: ME, token: { email_verified: true } } };
const ACTIVITY = "act-1";
const notAccessible = () =>
  Object.assign(new Error("activity not accessible"), {
    code: "activity-not-accessible",
  });

let firestore;
beforeEach(() => {
  firestore = memoryFirestore({
    [`activities/${ACTIVITY}`]: { authorId: "author", visibility: "public" },
  });
  vi.spyOn(db, "collection").mockImplementation(firestore.collection);
  vi.spyOn(db, "doc").mockImplementation(firestore.doc);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(
    accountDeletionLocks,
    "assertCallableActorNotDeleting"
  ).mockResolvedValue();
  vi.spyOn(restriction, "isRestricted").mockResolvedValue(false);
  vi.spyOn(restriction, "assertNotRestricted").mockResolvedValue();
  vi.spyOn(rateLimiter, "isRateLimited").mockResolvedValue(false);
  vi.spyOn(blockGuard, "isBlockedBetween").mockResolvedValue(false);
  vi.spyOn(socialFanout, "senderDisplayName").mockResolvedValue("Sam");
});
afterEach(() => vi.restoreAllMocks());

/** What a rejection tells the caller: its code and its sentence. */
async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return { code: err.code, message: err.message };
  }
  throw new Error("expected a rejection");
}

describe("a block is refused as an activity the caller cannot see", () => {
  it("props", async () => {
    vi.spyOn(blockGuard, "isBlockedBetween").mockResolvedValueOnce(true);
    const blocked = await rejection(
      toggleKudosCallable.run({ activityId: ACTIVITY }, CONTEXT)
    );
    vi.spyOn(socialCounters, "toggleKudos").mockRejectedValueOnce(
      notAccessible()
    );
    const unseen = await rejection(
      toggleKudosCallable.run({ activityId: ACTIVITY }, CONTEXT)
    );
    expect(blocked).toEqual(unseen);
    expect(blocked).toEqual({
      code: "permission-denied",
      message: "This activity is unavailable.",
    });
  });

  it("a comment", async () => {
    const data = { activityId: ACTIVITY, text: "Nice run" };
    vi.spyOn(blockGuard, "isBlockedBetween").mockResolvedValueOnce(true);
    const blocked = await rejection(addCommentCallable.run(data, CONTEXT));
    vi.spyOn(socialCounters, "addComment").mockRejectedValueOnce(
      notAccessible()
    );
    const unseen = await rejection(addCommentCallable.run(data, CONTEXT));
    expect(blocked).toEqual(unseen);
    expect(blocked.message).toBe("This activity is unavailable.");
  });
});

describe("a toggle never passes an engine's own message on", () => {
  it("props: contention becomes a sentence, its detail kept for the log", async () => {
    vi.spyOn(socialCounters, "toggleKudos").mockRejectedValueOnce(
      new Error("10 ABORTED: Too much contention on these documents.")
    );
    expect(
      await rejection(
        toggleKudosCallable.run({ activityId: ACTIVITY }, CONTEXT)
      )
    ).toEqual({ code: "internal", message: "Couldn't give props. Try again." });
  });

  it("a like", async () => {
    vi.spyOn(spacePostEngagement, "toggleSpacePostLike").mockRejectedValueOnce(
      new Error("toggleSpacePostLike: firestore, uid, spaceId, postId required")
    );
    const spaceId = require("../lib/spaceIds").SPACE_IDS[0];
    expect(
      await rejection(
        toggleSpacePostLikeCallable.run({ spaceId, postId: "p1" }, CONTEXT)
      )
    ).toEqual({
      code: "internal",
      message: "Couldn't like the post. Try again.",
    });
  });

  it("a reaction on a deleted comment says so", async () => {
    vi.spyOn(commentReactions, "toggleCommentReaction").mockRejectedValueOnce(
      new Error("comment-not-found")
    );
    const reaction = commentReactions.REACTION_KEYS[0];
    expect(
      await rejection(
        toggleCommentReactionCallable.run(
          { activityId: ACTIVITY, commentId: "c1", reaction },
          CONTEXT
        )
      )
    ).toEqual({
      code: "failed-precondition",
      message: "This comment has been deleted.",
    });
  });
});

describe("an id that is not one document's is refused before any read", () => {
  it.each(["a/b", "act/kudos/x", ".", "..", " act-1", "__name__"])(
    "props refuse %j",
    async (activityId) => {
      expect(
        (await rejection(toggleKudosCallable.run({ activityId }, CONTEXT))).code
      ).toBe("invalid-argument");
      expect(db.collection).not.toHaveBeenCalled();
    }
  );

  it("a reaction refuses a comment id with a slash", async () => {
    const reaction = commentReactions.REACTION_KEYS[0];
    expect(
      (
        await rejection(
          toggleCommentReactionCallable.run(
            { activityId: ACTIVITY, commentId: "c1/x", reaction },
            CONTEXT
          )
        )
      ).code
    ).toBe("invalid-argument");
  });
});

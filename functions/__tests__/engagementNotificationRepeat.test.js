/**
 * Props on an activity and a like on a Space post notify on the add edge.
 * Taking one back and giving it again is another add edge, and toggling
 * on, off, on as fast as the rate limit allows put a new "X gave you
 * props" row in the recipient's tray every second call.
 *
 * Each notice now has one id per giver and post, and a re-add that finds
 * its row leaves it as it is: one row, its first time kept (so the unread
 * badge, which counts rows newer than the tray was last opened, does not
 * count it again), and no push. Neither notice sends a push at all; the
 * test holds that too, so a push added later has to be added on purpose.
 * The row is still written by createNotification, with its fields, behind
 * the recipient's switch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  toggleKudosCallable,
  toggleSpacePostLikeCallable,
} = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;

const GIVER = "giver-1";
const AUTHOR = "author-1";
const AS = (uid) => ({ auth: { uid } });

let clock;
let messaging;
function useMemoryFirestore(seed = {}) {
  const db = memoryFirestore(seed);
  const ns = Object.assign(() => db, admin.firestore, {
    FieldValue: {
      // Each write's time is distinct, so a rewritten row shows.
      serverTimestamp: () => ({ at: ++clock }),
      increment: (n) => ({ increment: n }),
    },
  });
  Object.defineProperty(admin, "firestore", {
    value: ns,
    configurable: true,
    writable: true,
  });
  return db;
}

beforeEach(() => {
  clock = 0;
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
  rateLimiter.isRateLimited = async () => false;
  messaging = vi.fn(() => ({
    send: vi.fn(),
    sendEach: vi.fn(),
    sendEachForMulticast: vi.fn(),
  }));
  Object.defineProperty(admin, "messaging", {
    value: messaging,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  delete admin.firestore;
  delete admin.messaging;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  vi.restoreAllMocks();
});

const rows = (db, uid) =>
  [...db.data.keys()].filter((p) =>
    p.startsWith(`notifications/${uid}/items/`)
  );

describe.each([
  {
    name: "toggleKudosCallable",
    callable: toggleKudosCallable,
    request: { activityId: "act-1" },
    seed: {
      "activities/act-1": {
        authorId: AUTHOR,
        visibility: "public",
        kudosCount: 0,
      },
    },
    row: (uid) => `notifications/${AUTHOR}/items/kudos_act-1_${uid}`,
    type: "kudos",
    switchOff: { kudos: false },
  },
  {
    name: "toggleSpacePostLikeCallable",
    callable: toggleSpacePostLikeCallable,
    request: { spaceId: "runners", postId: "post-1" },
    seed: {
      "spaces/runners/posts/post-1": { authorId: AUTHOR, likeCount: 0 },
    },
    row: (uid) =>
      `notifications/${AUTHOR}/items/space_post_like_runners_post-1_${uid}`,
    type: "space_post_like",
    switchOff: { spaces: false },
  },
])(
  "$name — on, off, on",
  ({ callable, request, seed, row, type, switchOff }) => {
    it("leaves one row, as first written, and sends no push", async () => {
      const db = useMemoryFirestore({
        ...seed,
        [`users/${GIVER}/public/profile`]: { displayName: "Maya" },
      });

      await callable.run(request, AS(GIVER));
      const first = db.data.get(row(GIVER));
      expect(first).toMatchObject({
        type,
        fromUserId: GIVER,
        fromName: "Maya",
        read: false,
      });
      expect(first.createdAt).toEqual(
        expect.objectContaining({ at: expect.any(Number) })
      );

      for (let i = 0; i < 5; i += 1) {
        await callable.run(request, AS(GIVER)); // off
        await callable.run(request, AS(GIVER)); // on again
      }

      expect(rows(db, AUTHOR)).toEqual([row(GIVER)]);
      // Not rewritten: the same time, so it is not counted as new again.
      expect(db.data.get(row(GIVER))).toEqual(first);
      expect(messaging).not.toHaveBeenCalled();
    });

    it("gives each giver their own row", async () => {
      const db = useMemoryFirestore(seed);
      await callable.run(request, AS(GIVER));
      await callable.run(request, AS("giver-2"));
      expect(rows(db, AUTHOR).sort()).toEqual(
        [row(GIVER), row("giver-2")].sort()
      );
    });

    it("writes the notice again once the recipient has removed it", async () => {
      const db = useMemoryFirestore(seed);
      await callable.run(request, AS(GIVER));
      db.data.delete(row(GIVER));
      await callable.run(request, AS(GIVER)); // off
      await callable.run(request, AS(GIVER)); // on
      expect(rows(db, AUTHOR)).toEqual([row(GIVER)]);
    });

    it("still writes nothing when the recipient switched the kind off", async () => {
      const db = useMemoryFirestore({
        ...seed,
        [`users/${AUTHOR}`]: { notificationPreferences: switchOff },
      });
      await callable.run(request, AS(GIVER));
      await callable.run(request, AS(GIVER));
      await callable.run(request, AS(GIVER));
      expect(rows(db, AUTHOR)).toEqual([]);
    });
  }
);

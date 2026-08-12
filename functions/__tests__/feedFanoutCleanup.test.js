/**
 * `removeFanoutCopiesForUser` — erasure of a deleted user's denormalised
 * copies from other users' feeds.
 *
 * The property under test is not "some deletes happened". It is that the
 * EXACT set of `feeds/{recipient}/items/{activityId}` refs is addressed, and
 * that nothing outside `feeds/*\/items` is ever touched — this runs inside an
 * irreversible cascade, so an over-delete is unrecoverable. Every test below
 * asserts on the full recorded path set rather than a count.
 */
"use strict";

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const {
  removeFanoutCopiesForUser,
  BATCH_SIZE,
} = require_("../lib/feedFanoutCleanup.js");

const UID = "author-1";

/**
 * Minimal Firestore double. Records every ref a batch deleted, by full path,
 * so assertions can be made against the path set rather than a call count.
 */
function makeFirestore({
  followerIds = [],
  activityIds = [],
  readThrows = null,
  commitThrowsOnBatch = null,
} = {}) {
  const deletedPaths = [];
  let batchIndex = -1;

  const snap = (ids) => ({
    empty: ids.length === 0,
    docs: ids.map((id) => ({ id })),
  });

  return {
    deletedPaths,
    get batchCount() {
      return batchIndex + 1;
    },
    collection(name) {
      if (name === "activities") {
        return {
          where: () => ({
            get: async () => {
              if (readThrows) throw new Error(readThrows);
              return snap(activityIds);
            },
          }),
        };
      }
      return {
        doc: (docId) => ({
          collection: (sub) => ({
            get: async () => {
              if (readThrows) throw new Error(readThrows);
              return snap(name === "followers" ? followerIds : []);
            },
            doc: (leafId) => ({ path: `${name}/${docId}/${sub}/${leafId}` }),
          }),
        }),
      };
    },
    batch() {
      batchIndex += 1;
      const mine = batchIndex;
      const ops = [];
      return {
        delete(ref) {
          ops.push(ref);
          return this;
        },
        commit: async () => {
          if (commitThrowsOnBatch === mine) throw new Error("commit failed");
          ops.forEach((r) => deletedPaths.push(r.path));
        },
      };
    },
  };
}

describe("removeFanoutCopiesForUser", () => {
  it("deletes every recipient × activity copy, and nothing else (unit::accountDeletion.feedFanout)", async () => {
    const firestore = makeFirestore({
      followerIds: ["fan-a", "fan-b"],
      activityIds: ["act-1", "act-2"],
    });

    const result = await removeFanoutCopiesForUser({ firestore, uid: UID });

    // The author's own feed is a fan-out recipient too, so 3 recipients × 2.
    expect(new Set(firestore.deletedPaths)).toEqual(
      new Set([
        "feeds/fan-a/items/act-1",
        "feeds/fan-a/items/act-2",
        "feeds/fan-b/items/act-1",
        "feeds/fan-b/items/act-2",
        `feeds/${UID}/items/act-1`,
        `feeds/${UID}/items/act-2`,
      ])
    );
    // Asserted separately from the set: a Set comparison would pass if the
    // same path were pushed twice.
    expect(firestore.deletedPaths).toHaveLength(6);
    expect(result).toEqual({
      recipients: 3,
      activities: 2,
      deleted: 6,
      failedBatches: 0,
    });
  });

  it("only ever addresses feeds/*/items paths", async () => {
    // The blast-radius assertion. This runs mid-cascade against a live
    // Firestore, and the inventory's declared strategy is a collectionGroup
    // query that spans `notifications/*\/items` as well — so "we only touch
    // feeds" is the property that makes the direct-ref approach the safe one,
    // and it should fail loudly if a future edit reaches wider.
    const firestore = makeFirestore({
      followerIds: ["fan-a"],
      activityIds: ["act-1", "act-2", "act-3"],
    });

    await removeFanoutCopiesForUser({ firestore, uid: UID });

    expect(firestore.deletedPaths.length).toBeGreaterThan(0);
    for (const p of firestore.deletedPaths) {
      expect(p).toMatch(/^feeds\/[^/]+\/items\/[^/]+$/);
    }
  });

  it("sweeps the author's own feed even with no followers", async () => {
    // A user with zero followers still fanned out to themselves, and step 2
    // sweeping `feeds/{uid}/items` is a separate step this module must not
    // depend on.
    const firestore = makeFirestore({
      followerIds: [],
      activityIds: ["act-1"],
    });

    const result = await removeFanoutCopiesForUser({ firestore, uid: UID });

    expect(firestore.deletedPaths).toEqual([`feeds/${UID}/items/act-1`]);
    expect(result.recipients).toBe(1);
  });

  it("writes nothing when the user authored no activities", async () => {
    const firestore = makeFirestore({
      followerIds: ["fan-a", "fan-b"],
      activityIds: [],
    });

    const result = await removeFanoutCopiesForUser({ firestore, uid: UID });

    expect(firestore.deletedPaths).toEqual([]);
    expect(firestore.batchCount).toBe(0);
    expect(result).toEqual({
      recipients: 3,
      activities: 0,
      deleted: 0,
      failedBatches: 0,
    });
  });

  it("splits the cross product across batches at the write cap", async () => {
    // 2 recipients (1 follower + self) × 300 activities = 600 refs, which
    // must not go into one batch — Firestore rejects >500 writes and the
    // whole sweep would be lost.
    const activityIds = Array.from({ length: 300 }, (_, i) => `act-${i}`);
    const firestore = makeFirestore({ followerIds: ["fan-a"], activityIds });

    const result = await removeFanoutCopiesForUser({ firestore, uid: UID });

    expect(result.deleted).toBe(600);
    expect(firestore.batchCount).toBe(Math.ceil(600 / BATCH_SIZE));
    expect(BATCH_SIZE).toBeLessThanOrEqual(500);
  });

  it("returns zeroes rather than throwing when the reads fail", async () => {
    // A throw here would abort the cascade before the auth user is deleted.
    // That leaves credentials intact — the executor's retry invariant — but
    // it also means a transient Firestore blip blocks every deletion, and
    // this sweep is the least critical step to fail the whole cascade on.
    const firestore = makeFirestore({
      followerIds: ["fan-a"],
      activityIds: ["act-1"],
      readThrows: "unavailable",
    });

    const result = await removeFanoutCopiesForUser({ firestore, uid: UID });

    expect(result).toEqual({
      recipients: 0,
      activities: 0,
      deleted: 0,
      failedBatches: 0,
    });
    expect(firestore.deletedPaths).toEqual([]);
  });

  it("keeps going after a failed batch and reports it", async () => {
    const activityIds = Array.from({ length: 300 }, (_, i) => `act-${i}`);
    const firestore = makeFirestore({
      followerIds: ["fan-a"],
      activityIds,
      commitThrowsOnBatch: 0,
    });

    const result = await removeFanoutCopiesForUser({ firestore, uid: UID });

    expect(result.failedBatches).toBe(1);
    // The surviving batches still landed — a partial purge beats none.
    expect(result.deleted).toBe(600 - BATCH_SIZE);
    expect(firestore.deletedPaths.length).toBe(600 - BATCH_SIZE);
  });

  it("no-ops on missing arguments", async () => {
    await expect(
      removeFanoutCopiesForUser({ firestore: null, uid: UID })
    ).resolves.toEqual({
      recipients: 0,
      activities: 0,
      deleted: 0,
      failedBatches: 0,
    });
    await expect(
      removeFanoutCopiesForUser({ firestore: makeFirestore(), uid: "" })
    ).resolves.toEqual({
      recipients: 0,
      activities: 0,
      deleted: 0,
      failedBatches: 0,
    });
  });
});

describe("the residue this approach knowingly leaves", () => {
  it("does not reach a copy in an EX-follower's feed", async () => {
    /* Stated as a test rather than only a comment, because it is the one
       claim the module's header makes that a reader would most want to
       verify, and because a future change that closes it should have to
       delete this test deliberately.

       `unfollowUser` deletes the two edge docs and nothing else, so B's feed
       keeps A's items after B unfollows A. Recipients here come from
       `followers/{uid}/users`, so B is no longer in the set. Closing this
       needs the collectionGroup sweep the inventory declares, which needs a
       COLLECTION_GROUP index that `firestore.indexes.json` does not have. */
    const firestore = makeFirestore({
      followerIds: ["still-following"],
      activityIds: ["act-1"],
    });

    await removeFanoutCopiesForUser({ firestore, uid: UID });

    expect(firestore.deletedPaths).toContain("feeds/still-following/items/act-1");
    expect(firestore.deletedPaths).not.toContain("feeds/ex-follower/items/act-1");
  });
});

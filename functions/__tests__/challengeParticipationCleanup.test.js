/**
 * `removeChallengeParticipationsForUser` — erasure of a deleted user's
 * challenge progress docs (inventory `challengeParticipations`,
 * unit::accountDeletion.challengeParticipations).
 *
 * The property is the exact ref set, not a count. This runs inside an
 * irreversible cascade, and the failure that matters most is deleting
 * SOMEONE ELSE'S participant doc — so every assertion below is against the
 * full recorded path set.
 */
"use strict";

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const {
  removeChallengeParticipationsForUser,
  BATCH_SIZE,
} = require_("../lib/challengeParticipationCleanup.js");

const UID = "user-1";

function makeFirestore({
  challengeIds = [],
  readThrows = null,
  commitThrowsOnBatch = null,
  withSelect = true,
} = {}) {
  const deletedPaths = [];
  const selectCalls = { count: 0 };
  let batchIndex = -1;

  const snap = () => ({
    empty: challengeIds.length === 0,
    docs: challengeIds.map((id) => ({ id })),
  });

  const challengesCollection = {
    get: async () => {
      if (readThrows) throw new Error(readThrows);
      return snap();
    },
    doc: (cid) => ({
      collection: (sub) => ({
        doc: (leaf) => ({ path: `challenges/${cid}/${sub}/${leaf}` }),
      }),
    }),
  };
  if (withSelect) {
    challengesCollection.select = () => {
      selectCalls.count += 1;
      return {
        get: async () => {
          if (readThrows) throw new Error(readThrows);
          return snap();
        },
      };
    };
  }

  return {
    deletedPaths,
    selectCalls,
    get batchCount() {
      return batchIndex + 1;
    },
    collection(name) {
      if (name === "challenges") return challengesCollection;
      throw new Error(`unexpected collection: ${name}`);
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

describe("removeChallengeParticipationsForUser", () => {
  it("deletes this uid's participant doc in every challenge, and nothing else", async () => {
    const firestore = makeFirestore({
      challengeIds: ["weekly-2026-08-10", "global-monthly-2026-08-01"],
    });

    const result = await removeChallengeParticipationsForUser({
      firestore,
      uid: UID,
    });

    expect(firestore.deletedPaths.sort()).toEqual([
      `challenges/global-monthly-2026-08-01/participants/${UID}`,
      `challenges/weekly-2026-08-10/participants/${UID}`,
    ]);
    expect(result).toEqual({ challenges: 2, deleted: 2, failedBatches: 0 });
  });

  it("never addresses another user's participant doc", async () => {
    // The blast-radius assertion. The doc id is the uid, so an implementation
    // that enumerated participants instead of addressing them by name could
    // trivially delete the wrong ones.
    const firestore = makeFirestore({ challengeIds: ["ch1", "ch2", "ch3"] });

    await removeChallengeParticipationsForUser({ firestore, uid: UID });

    expect(firestore.deletedPaths.length).toBe(3);
    for (const p of firestore.deletedPaths) {
      expect(p).toMatch(
        new RegExp(`^challenges/[^/]+/participants/${UID}$`)
      );
    }
  });

  it("reads only doc ids when the driver supports select()", async () => {
    // The listing is the one unbounded-ish cost here. `.select()` keeps it
    // flat as challenge docs gain fields; without it the sweep would pull
    // every challenge's full metadata on every account deletion.
    const firestore = makeFirestore({ challengeIds: ["ch1"] });

    await removeChallengeParticipationsForUser({ firestore, uid: UID });

    expect(firestore.selectCalls.count).toBe(1);
  });

  it("still works against a driver without select()", async () => {
    // The fallback exists so the module stays testable against plain stubs;
    // asserted so it cannot rot into a path nothing exercises.
    const firestore = makeFirestore({
      challengeIds: ["ch1", "ch2"],
      withSelect: false,
    });

    const result = await removeChallengeParticipationsForUser({
      firestore,
      uid: UID,
    });

    expect(result.deleted).toBe(2);
    expect(firestore.deletedPaths.length).toBe(2);
  });

  it("writes nothing when there are no challenges", async () => {
    const firestore = makeFirestore({ challengeIds: [] });

    const result = await removeChallengeParticipationsForUser({
      firestore,
      uid: UID,
    });

    expect(firestore.deletedPaths).toEqual([]);
    expect(firestore.batchCount).toBe(0);
    expect(result).toEqual({ challenges: 0, deleted: 0, failedBatches: 0 });
  });

  it("splits a large challenge set across batches at the write cap", async () => {
    const challengeIds = Array.from({ length: 1000 }, (_, i) => `ch-${i}`);
    const firestore = makeFirestore({ challengeIds });

    const result = await removeChallengeParticipationsForUser({
      firestore,
      uid: UID,
    });

    expect(result.deleted).toBe(1000);
    expect(firestore.batchCount).toBe(Math.ceil(1000 / BATCH_SIZE));
    expect(BATCH_SIZE).toBeLessThanOrEqual(500);
  });

  it("returns zeroes rather than throwing when the listing fails", async () => {
    // A throw here would abort the cascade. That leaves credentials intact,
    // which is the retry invariant — but it also means a transient blip
    // blocks every deletion, and this is not the step to fail them on.
    const firestore = makeFirestore({
      challengeIds: ["ch1"],
      readThrows: "unavailable",
    });

    const result = await removeChallengeParticipationsForUser({
      firestore,
      uid: UID,
    });

    expect(result).toEqual({ challenges: 0, deleted: 0, failedBatches: 0 });
    expect(firestore.deletedPaths).toEqual([]);
  });

  it("keeps going after a failed batch and reports it", async () => {
    const challengeIds = Array.from({ length: 600 }, (_, i) => `ch-${i}`);
    const firestore = makeFirestore({
      challengeIds,
      commitThrowsOnBatch: 0,
    });

    const result = await removeChallengeParticipationsForUser({
      firestore,
      uid: UID,
    });

    expect(result.failedBatches).toBe(1);
    expect(result.deleted).toBe(600 - BATCH_SIZE);
  });

  it("no-ops on missing arguments", async () => {
    const zero = { challenges: 0, deleted: 0, failedBatches: 0 };
    await expect(
      removeChallengeParticipationsForUser({ firestore: null, uid: UID })
    ).resolves.toEqual(zero);
    await expect(
      removeChallengeParticipationsForUser({
        firestore: makeFirestore(),
        uid: "",
      })
    ).resolves.toEqual(zero);
  });
});

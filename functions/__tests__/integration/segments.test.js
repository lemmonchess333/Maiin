/**
 * Integration: segments (Run26 call 3, lib/segments.js) against the
 * emulator, through the real run triggers and the board callable's reader.
 *
 * What only the emulator holds: the start-cell `in` query that finds a
 * run's candidate segments, the count aggregations the board reads first,
 * a transaction that reads a query (a runner's efforts on one segment) and
 * the collection-group sweeps that delete a segment's efforts from
 * everyone's tree and an account's board entries from everyone's segments.
 * Every write assertion is paired with the refusal or removal beside it.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

const { savedRun, nearestIndex } = require("../helpers/segmentTraces.cjs");

let db;
let idx;
let segments;

const MAKER = "u-seg-maker";
const RUNNER = "u-seg-runner";
const VIEWER = "u-seg-viewer";
const PEOPLE = [MAKER, RUNNER, VIEWER];
const THROUGH = [
  [-200, 0],
  [1200, 0],
];
/** Long before the performance recompute's window. */
const OLD_DAY = "2020-03-01";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  idx = require("../../index");
  db = require("../../lib/adminSdk").firestore();
  segments = require("../../lib/segments");
});

async function wipe() {
  for (const uid of PEOPLE) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.recursiveDelete(db.doc(`following/${uid}`));
    await db.recursiveDelete(db.doc(`followers/${uid}`));
    await db.recursiveDelete(db.doc(`blocks/${uid}`));
  }
  for (const doc of (await db.collection("segmentOwners").get()).docs) {
    await db.recursiveDelete(db.doc(`segments/${doc.id}`));
    await doc.ref.delete();
  }
  for (const id of ["post-r1", "post-made"])
    await db.doc(`activities/${id}`).delete();
}

async function deliverRunCreated(uid, runId) {
  const snap = await db.doc(`users/${uid}/runs/${runId}`).get();
  await idx.onRunCreated.run(snap, {
    params: { uid, runId },
    timestamp: new Date().toISOString(),
  });
}

async function seedRun(uid, runId, { shared } = {}) {
  const run = savedRun(THROUGH, { date: OLD_DAY });
  if (shared) {
    await db.doc(`activities/${shared}`).set({
      authorId: uid,
      type: "run",
      visibility: "followers",
    });
    run.sharedActivityId = shared;
  }
  await db.doc(`users/${uid}/runs/${runId}`).set(run);
  return run;
}

suite("segments against Firestore", () => {
  let segmentId;

  beforeEach(async () => {
    await wipe();
    for (const uid of PEOPLE)
      await db.doc(`users/${uid}/public/profile`).set({ displayName: uid });
    const made = await seedRun(MAKER, "made", { shared: "post-made" });
    ({ segmentId } = await segments.createSegment(db, {
      uid: MAKER,
      runId: "made",
      startIndex: nearestIndex(made.points, 0, 0),
      endIndex: nearestIndex(made.points, 1000, 0),
      name: "Common straight",
    }));
  });

  it("times a saved run through onRunCreated and shows it to a follower only", async () => {
    await seedRun(RUNNER, "r1", { shared: "post-r1" });
    await deliverRunCreated(RUNNER, "r1");
    const effort = await db
      .doc(`users/${RUNNER}/segmentEfforts/r1_${segmentId}_1`)
      .get();
    expect(effort.data()).toMatchObject({ segmentId, elapsedSeconds: 250 });

    // Not following anyone: nothing.
    expect(
      await segments.readSegmentBoard(db, { viewerUid: VIEWER, segmentId })
    ).toEqual({ entries: [] });
    await db.doc(`following/${VIEWER}/users/${RUNNER}`).set({ followedAt: 1 });
    await db.doc(`followers/${RUNNER}/users/${VIEWER}`).set({ followedAt: 1 });
    const { entries } = await segments.readSegmentBoard(db, {
      viewerUid: VIEWER,
      segmentId,
    });
    expect(entries.map((e) => [e.uid, e.elapsedSeconds])).toEqual([
      [RUNNER, 250],
    ]);
    // Blocked by the runner: nothing again.
    await db.doc(`blocks/${RUNNER}/users/${VIEWER}`).set({ blockedAt: 1 });
    expect(
      await segments.readSegmentBoard(db, { viewerUid: VIEWER, segmentId })
    ).toEqual({ entries: [] });
  });

  it("takes a deleted run's effort and board entry through onRunDeleted", async () => {
    const run = await seedRun(RUNNER, "r1", { shared: "post-r1" });
    await deliverRunCreated(RUNNER, "r1");
    expect(
      (await db.doc(`segments/${segmentId}/board/${RUNNER}`).get()).exists
    ).toBe(true);
    await db.doc(`users/${RUNNER}/runs/r1`).delete();
    await idx.onRunDeleted.run(
      { data: () => run },
      {
        params: { uid: RUNNER, runId: "r1" },
        timestamp: new Date().toISOString(),
      }
    );
    expect(
      (await db.collection(`users/${RUNNER}/segmentEfforts`).get()).empty
    ).toBe(true);
    expect(
      (await db.doc(`segments/${segmentId}/board/${RUNNER}`).get()).exists
    ).toBe(false);
  });

  it("sweeps a maker's segment from everyone's tree, and their entries from everyone's boards", async () => {
    await seedRun(RUNNER, "r1", { shared: "post-r1" });
    await deliverRunCreated(RUNNER, "r1");
    const removed = await segments.removeSegmentTracesForUser(db, MAKER);
    expect(removed.segments).toBe(1);
    expect((await db.doc(`segments/${segmentId}`).get()).exists).toBe(false);
    expect((await db.doc(`segmentOwners/${segmentId}`).get()).exists).toBe(
      false
    );
    expect(
      (
        await db
          .collectionGroup("segmentEfforts")
          .where("segmentId", "==", segmentId)
          .get()
      ).empty
    ).toBe(true);
  });
});

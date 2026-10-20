/**
 * Integration: the friends board's tally (Polish2 call 5) through the real
 * callable and session triggers, against the emulator.
 *
 * The parts worth holding meet only there: the date-range queries read
 * inside a transaction, the answer the callable stores with the tally,
 * and the triggers recomputing it as sessions are saved and deleted.
 * Dates come from the clock, so the run under a moved clock reads the
 * same week.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let idx;
const board = require("../../lib/friendsBoard");

const UID = "friendsboard-alice";
const auth = { auth: { uid: UID, token: { email_verified: true } } };

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  idx = require("../../index");
  db = require("firebase-admin").firestore();
});

async function wipe() {
  await db.recursiveDelete(db.doc(`users/${UID}`));
  await db.doc(`friendsBoard/${UID}`).delete();
}

const tally = async () => {
  const snap = await db.doc(`friendsBoard/${UID}`).get();
  return snap.exists ? snap.data() : null;
};

suite("the friends board's tally", () => {
  // This week's Monday where Alice is (no timezone: UTC).
  let monday;
  beforeEach(async () => {
    await wipe();
    monday = board.currentWeek(null).weekKey;
    await db.doc(`users/${UID}/workouts/w1`).set({
      date: monday,
      exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }],
      totalVolume: 500,
    });
  });

  it("Show my week stores the answer and this week at once", async () => {
    await idx.setBoardSharing.run({ share: true }, auth);

    expect((await db.doc(`users/${UID}`).get()).data().showWeekOnBoard).toBe(
      true
    );
    expect(await tally()).toMatchObject({
      uid: UID,
      weekKey: monday,
      sessions: 1,
      lifts: 1,
      volumeKg: 500,
    });
  });

  it("a run saved and then deleted moves the board both ways", async () => {
    await idx.setBoardSharing.run({ share: true }, auth);
    const ref = db.doc(`users/${UID}/runs/r1`);
    await ref.set({ date: monday, distance: 5200, duration: 1600 });
    const snap = await ref.get();
    const context = { params: { uid: UID, runId: "r1" } };

    await idx.onRunCreated.run(snap, context);
    expect(await tally()).toMatchObject({
      sessions: 2,
      runs: 1,
      distanceM: 5200,
    });

    await ref.delete();
    await idx.onRunDeleted.run(snap, context);
    expect(await tally()).toMatchObject({ sessions: 1, runs: 0, distanceM: 0 });
  });

  it("no leaves nothing to read, and a later session writes nothing", async () => {
    await idx.setBoardSharing.run({ share: true }, auth);
    await idx.setBoardSharing.run({ share: false }, auth);

    expect((await db.doc(`users/${UID}`).get()).data().showWeekOnBoard).toBe(
      false
    );
    expect(await tally()).toBeNull();

    const ref = db.doc(`users/${UID}/runs/r2`);
    await ref.set({ date: monday, distance: 5200, duration: 1600 });
    await idx.onRunCreated.run(await ref.get(), {
      params: { uid: UID, runId: "r2" },
    });
    expect(await tally()).toBeNull();
  });

  it("nothing is kept for someone who never chose", async () => {
    const ref = db.doc(`users/${UID}/runs/r3`);
    await ref.set({ date: monday, distance: 5200, duration: 1600 });
    await idx.onRunCreated.run(await ref.get(), {
      params: { uid: UID, runId: "r3" },
    });
    expect(await tally()).toBeNull();
  });

  it("the answer must be yes or no", async () => {
    await expect(
      idx.setBoardSharing.run({ share: "yes" }, auth)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      idx.setBoardSharing.run({ share: true }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

/**
 * Integration: the person blocked's copy of a block (Polish3 call 1).
 *
 * `onBlockWritten` runs on every write of `blocks/{blocker}/users/{blocked}`
 * and keeps `blockedBy/{blocked}/users/{blocker}` matching it. Driven
 * through the real trigger against the emulator, because the parts worth
 * holding meet only there: the trigger's path params, the Admin SDK
 * transaction, and `listDocuments` finding parents that exist only as
 * paths, which is all `blocks/{uid}` and `blockedBy/{uid}` ever are.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let onBlockWritten;
let backfillBlockMirrors;

const ALICE = "blockmirror-alice";
const BOB = "blockmirror-bob";
const CAROL = "blockmirror-carol";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  ({ onBlockWritten } = require("../../index"));
  ({ backfillBlockMirrors } = require("../../lib/blockMirror"));
  db = require("firebase-admin").firestore();
});

async function wipe() {
  for (const root of ["blocks", "blockedBy"]) {
    for (const uid of [ALICE, BOB, CAROL]) {
      await db.recursiveDelete(db.collection(`${root}/${uid}/users`));
    }
  }
}

const rowsFor = async (uid) =>
  (await db.collection(`blockedBy/${uid}/users`).get()).docs.map((d) => d.id);

/** A write to the block, then the trigger's delivery of it. */
async function deliver(blocker, blocked) {
  const ref = db.doc(`blocks/${blocker}/users/${blocked}`);
  const snap = await ref.get();
  await onBlockWritten.run(
    { before: snap, after: snap },
    { params: { blockerUid: blocker, blockedUid: blocked } }
  );
}

suite("onBlockWritten keeps the copy for the person blocked", () => {
  // The first Admin SDK call of a run can be slow to find its project.
  beforeEach(wipe, 60_000);

  it("writes the row on a block and removes it on an unblock", async () => {
    await db.doc(`blocks/${ALICE}/users/${BOB}`).set({ blockedAt: new Date() });
    await deliver(ALICE, BOB);
    expect(await rowsFor(BOB)).toEqual([ALICE]);
    // The blocker has no row of their own for it.
    expect(await rowsFor(ALICE)).toEqual([]);

    await db.doc(`blocks/${ALICE}/users/${BOB}`).delete();
    await deliver(ALICE, BOB);
    expect(await rowsFor(BOB)).toEqual([]);
  });

  it("is safe to deliver twice, and late", async () => {
    await db.doc(`blocks/${ALICE}/users/${BOB}`).set({ blockedAt: new Date() });
    await deliver(ALICE, BOB);
    await deliver(ALICE, BOB);
    expect(await rowsFor(BOB)).toEqual([ALICE]);

    // Unblocked, then the original block's delivery arrives again.
    await db.doc(`blocks/${ALICE}/users/${BOB}`).delete();
    await deliver(ALICE, BOB);
    await deliver(ALICE, BOB);
    expect(await rowsFor(BOB)).toEqual([]);
  });

  it("agrees with the block when deliveries run at once", async () => {
    await db.doc(`blocks/${ALICE}/users/${BOB}`).set({ blockedAt: new Date() });
    await Promise.all([deliver(ALICE, BOB), deliver(ALICE, BOB)]);
    expect(await rowsFor(BOB)).toEqual([ALICE]);
  });
});

suite("backfillBlockMirrors brings every row into line", () => {
  // The first Admin SDK call of a run can be slow to find its project.
  beforeEach(wipe, 60_000);

  it("writes a row for each block written before the trigger, and drops rows without one", async () => {
    await db.doc(`blocks/${ALICE}/users/${BOB}`).set({ blockedAt: new Date() });
    await db.doc(`blocks/${CAROL}/users/${BOB}`).set({ blockedAt: new Date() });
    await db.doc(`blocks/${BOB}/users/${CAROL}`).set({ blockedAt: new Date() });
    // A row left behind by a block that is gone.
    await db.doc(`blockedBy/${ALICE}/users/${CAROL}`).set({});

    // Other suites share the emulator and may leave blocks of their own,
    // so the totals are at least these.
    const first = await backfillBlockMirrors({ firestore: db });
    expect(first.mirrored).toBeGreaterThanOrEqual(3);
    expect(first.removed).toBeGreaterThanOrEqual(1);
    expect((await rowsFor(BOB)).sort()).toEqual([ALICE, CAROL]);
    expect(await rowsFor(CAROL)).toEqual([BOB]);
    expect(await rowsFor(ALICE)).toEqual([]);

    // A second run finds everything in line.
    expect(await backfillBlockMirrors({ firestore: db })).toMatchObject({
      mirrored: 0,
      removed: 0,
    });
  });
});

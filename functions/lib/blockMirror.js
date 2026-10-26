"use strict";

/**
 * Who has blocked each account, for that account's own app (Polish3 call 1,
 * completing S4's symmetric blocks).
 *
 * A block is written by the person blocking, at
 * `blocks/{blocker}/users/{blocked}`, and only they may read it. The rules
 * already refuse follows, props, comments and followers-only posts across a
 * block in both directions, but the app of the person blocked filters its
 * feeds, Explore, Spaces, comments and boards from a list it can read, and
 * it could not read who had blocked it. So it went on showing the blocker's
 * public posts and profile to the one person they had blocked.
 *
 * `blockedBy/{blocked}/users/{blocker}` is that list. It is written here and
 * nowhere else; the rules let the account it describes read it and nobody
 * write it. A row carries nothing but its id.
 *
 * Every delivery sets the row to what the block is NOW, read in the
 * transaction that writes the row, rather than to what the event says
 * happened. Deliveries are at least once and in no particular order: a
 * block, an unblock and a block again inside a second can arrive in any
 * order, twice each, and every one of them still leaves the row matching
 * the block.
 *
 * An account being deleted gets no new row, as blocker or as blocked: the
 * deletion executor removes both kinds (accountDeletionInventory.json,
 * `blockedByOwn` and `blockedByReverse`), and a row written behind it would
 * outlive the account. Removing a row is always allowed.
 */

const accountDeletionLocks = require("./accountDeletionLocks");

const blockRef = (firestore, blockerUid, blockedUid) =>
  firestore
    .collection("blocks")
    .doc(blockerUid)
    .collection("users")
    .doc(blockedUid);

const mirrorRef = (firestore, blockerUid, blockedUid) =>
  firestore
    .collection("blockedBy")
    .doc(blockedUid)
    .collection("users")
    .doc(blockerUid);

const validUid = (uid) => typeof uid === "string" && uid.length > 0;

/**
 * Make `blockedBy/{blocked}/users/{blocker}` match
 * `blocks/{blocker}/users/{blocked}`.
 *
 * @returns {Promise<"mirrored" | "removed" | "unchanged" | "skipped">}
 *   `skipped` when the pair is not a real block (a self-block, a bad id) or
 *   when a row would be written for an account being deleted.
 */
async function reconcileBlockMirror({ firestore, blockerUid, blockedUid }) {
  if (!validUid(blockerUid) || !validUid(blockedUid)) return "skipped";
  if (blockerUid === blockedUid) return "skipped";
  const source = blockRef(firestore, blockerUid, blockedUid);
  const mirror = mirrorRef(firestore, blockerUid, blockedUid);

  // Outside the transaction's reads: a deleting account only ever stops a
  // row being written, and the executor removes any row that slips past.
  const writable = async () =>
    (await accountDeletionLocks.shouldSystemWriteProceed(
      firestore,
      blockerUid,
      "blockMirror"
    )) &&
    (await accountDeletionLocks.shouldSystemWriteProceed(
      firestore,
      blockedUid,
      "blockMirror"
    ));

  return firestore.runTransaction(async (tx) => {
    const block = await tx.get(source);
    const row = await tx.get(mirror);
    if (block.exists) {
      if (row.exists) return "unchanged";
      if (!(await writable())) return "skipped";
      tx.set(mirror, {});
      return "mirrored";
    }
    if (!row.exists) return "unchanged";
    tx.delete(mirror);
    return "removed";
  });
}

/**
 * Bring every row into line with the blocks, both ways: a row for each
 * block, and no row without one. For blocks written before the trigger
 * existed (functions/scripts/backfill-block-mirror.js), and safe to run
 * again at any time. `listDocuments` returns parents that exist only as
 * paths, which is what `blocks/{uid}` and `blockedBy/{uid}` are.
 *
 * @returns {Promise<{ checked: number, mirrored: number, removed: number }>}
 */
async function backfillBlockMirrors({ firestore }) {
  const totals = { checked: 0, mirrored: 0, removed: 0 };
  const count = (result) => {
    totals.checked += 1;
    if (result === "mirrored") totals.mirrored += 1;
    if (result === "removed") totals.removed += 1;
  };
  for (const blocker of await firestore.collection("blocks").listDocuments()) {
    for (const edge of await blocker.collection("users").listDocuments()) {
      count(
        await reconcileBlockMirror({
          firestore,
          blockerUid: blocker.id,
          blockedUid: edge.id,
        })
      );
    }
  }
  for (const blocked of await firestore
    .collection("blockedBy")
    .listDocuments()) {
    for (const row of await blocked.collection("users").listDocuments()) {
      count(
        await reconcileBlockMirror({
          firestore,
          blockerUid: row.id,
          blockedUid: blocked.id,
        })
      );
    }
  }
  return totals;
}

module.exports = {
  reconcileBlockMirror,
  backfillBlockMirrors,
};

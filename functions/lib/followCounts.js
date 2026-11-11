"use strict";

/**
 * Follow counts: how many people follow an account and how many it
 * follows, kept where a profile can read the two numbers without the
 * lists.
 *
 * `followCounts/{uid}` holds `{ followers, followersAt, following,
 * followingAt }`. Anyone signed in reads one, and only this module writes
 * it. The lists (`followers/{uid}/users`, `following/{uid}/users`) say
 * who; a profile only ever needed how many.
 *
 * - Each number is a count aggregation over the account's own list, never
 *   an increment. It is taken again whenever an edge in that list is made
 *   or removed (`onFollowerEdgeWritten`, `onFollowingEdgeWritten`). A
 *   retried or doubled delivery counts the same edges and stores the same
 *   number.
 * - `followersAt` and `followingAt` are when each count was true, the
 *   aggregation's read time. Two recounts can finish out of order, so a
 *   count read before the one stored is dropped: the rule
 *   `recountRaceCohort` follows, with its two helpers.
 * - The two sides are counted and stored apart, each merged into the
 *   document, so one side's write never carries a stale copy of the other.
 * - A side nobody has counted is absent, not 0. Every account is counted
 *   once by scripts/backfill-follow-counts.js.
 * - Nothing is written for an account being deleted. Its edges are going
 *   and each removal lands here, so the freeze is read in the transaction
 *   that would write (deletionTransactionGuard.js). The executor deletes
 *   the document with the account.
 */

const { millisOf, shouldStoreCount } = require("./raceCohorts");
const { transactionAccountsLive } = require("./deletionTransactionGuard");

const COLLECTION = "followCounts";
const BACKFILL_PAGE = 300;

/** The two lists, and the field that says when each was last counted. */
const SIDES = Object.freeze({
  followers: Object.freeze({ list: "followers", at: "followersAt" }),
  following: Object.freeze({ list: "following", at: "followingAt" }),
});

/** An edge made or removed changes its list's size. One rewritten does not. */
function edgeMovesCount(beforeExists, afterExists) {
  return Boolean(beforeExists) !== Boolean(afterExists);
}

/**
 * Count one side of `uid`'s follows and store it, unless a later count of
 * that side is stored already or the account is being deleted. Resolves to
 * `{ uid, side, count, written, changed }`: `changed` is a write that moved
 * the number, or stored it for the first time.
 */
async function recountFollowSide(db, uid, side, { now = Date.now() } = {}) {
  const spec = SIDES[side];
  if (!spec || typeof uid !== "string" || !uid) {
    return { uid, side, count: null, written: false, changed: false };
  }
  const snap = await db
    .collection(spec.list)
    .doc(uid)
    .collection("users")
    .count()
    .get();
  const count = snap.data().count;
  const observedMs = millisOf(snap.readTime) || now;
  const ref = db.collection(COLLECTION).doc(uid);
  const outcome = await db.runTransaction(async (tx) => {
    const untouched = { written: false, changed: false };
    if (!(await transactionAccountsLive({ firestore: db, tx, uids: [uid] }))) {
      return untouched;
    }
    const stored = await tx.get(ref);
    const data = stored.exists ? stored.data() || {} : {};
    if (!shouldStoreCount(observedMs, millisOf(data[spec.at]))) {
      return untouched;
    }
    tx.set(
      ref,
      { [side]: count, [spec.at]: new Date(observedMs) },
      { merge: true }
    );
    return { written: true, changed: data[side] !== count };
  });
  return { uid, side, count, ...outcome };
}

/**
 * Count both sides for every account, in id order. Safe to run again at
 * any time, and beside the live triggers: each count is stored only if it
 * was read after the one already there. Resolves to the totals, where
 * `changed` is how many stored numbers moved or were new: 0 on a second
 * run over lists nobody touched in between.
 */
async function backfillFollowCounts(
  db,
  {
    now = Date.now(),
    // admin.firestore.FieldPath.documentId; the bare name works as well.
    documentId = () => "__name__",
    pageSize = BACKFILL_PAGE,
  } = {}
) {
  const totals = { accounts: 0, written: 0, changed: 0, skipped: 0 };
  const users = db.collection("users");
  let last = null;
  for (;;) {
    let page = users.orderBy(documentId()).limit(pageSize);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    for (const user of snap.docs) {
      totals.accounts += 1;
      for (const side of Object.keys(SIDES)) {
        const result = await recountFollowSide(db, user.id, side, { now });
        if (result.written) totals.written += 1;
        else totals.skipped += 1;
        if (result.changed) totals.changed += 1;
      }
    }
    if (snap.docs.length < pageSize) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return totals;
}

module.exports = {
  COLLECTION,
  SIDES,
  BACKFILL_PAGE,
  edgeMovesCount,
  recountFollowSide,
  backfillFollowCounts,
};

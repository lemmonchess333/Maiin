"use strict";

/**
 * Deleted meals are removed for good 30 days after they were deleted (F5c,
 * the owner's "Purge after 30 days": Apple Photos' and
 * iCloud's Recently Deleted window).
 *
 * Deleting a meal in the diary is soft: the app stamps `deletedAt` on
 * `users/{uid}/meals/{mealId}` (`undoMealEntries`, src/lib/mealEntry.ts)
 * and the meal waits in Settings, Recently deleted meals, where the person
 * can restore it or delete it permanently. `purgeSoftDeletedMeals`, each
 * hour (functions/index.js), deletes every meal whose 30 days are up.
 *
 * What a purge does is what Delete permanently does on the server: it
 * deletes the document, and nothing else. That delete fires
 * `onMealWritten`, which returns on a meal with no `after` before reading
 * anything (lib/badgeAwards.js), so a badge the meal helped earn stays and
 * nothing is counted again; day totals are read from the meals there are,
 * and soft-deleted ones were left out of them already (lib/mealDocs.js).
 * Delete permanently also drops the meal's photo from the phone
 * (src/lib/foodPhotoStore.ts). The server cannot reach a phone, and needs
 * not: a deleted meal shows no photo anywhere once it is gone, and the
 * phone's own sweep deletes every photo 90 days after it was taken.
 *
 * The 30 days run from the later of `deletedAt` (the phone's clock, when
 * the person tapped Delete) and the document's `updateTime` (the server's
 * clock, when it took the last write). Usually they are a moment apart. A
 * delete queued offline reaches the server later, and a phone whose clock
 * runs behind stamps a `deletedAt` in the past; either way the meal still
 * gets its 30 days. A phone whose clock runs ahead stamps one in the
 * future, and the query below finds the meal only 30 days after that
 * stamp: it is kept longer, never removed early. A meal whose snapshot has
 * no `updateTime` is kept: the Admin SDK always gives one, and without it
 * there is no telling when the delete reached the server.
 *
 * Each meal is checked again, and deleted, in a transaction that also reads
 * the account's deletion freeze (lib/deletionTransactionGuard.js). A server
 * transaction locks what it reads, so a write is either before those reads
 * and seen, or after them and made to wait for the commit:
 *   - A restore written before the reads is seen, and the meal is kept.
 *   - A deletion request written before the reads is seen, and the account
 *     is left to the deletion executor, which removes every meal itself
 *     (F5c pin (b)). One written after them waits, and the executor then
 *     finds those meals already gone.
 *   - A restore written after the reads waits, and lands after the delete.
 *     The app's restore is a merge write of `deletedAt: null`
 *     (`restoreMealEntries`), so on the deleted document it makes a stub
 *     holding only that and `_offlineCreatedAt`. The stub has no `date` or
 *     `createdAt`, so no diary, total or export reads it. This is the
 *     known same-instant edge: a
 *     restore tapped as the job runs, or one queued offline across the 30
 *     days. Delete permanently on one phone with a restore queued on
 *     another makes the same stub.
 *
 * The 30 days are mirrored by src/lib/mealPurge.ts, which tells the person
 * how long each deleted meal has left, and pinned to it by
 * mealPurge.cross.test.ts, which runs this job.
 */

const { transactionAccountsLive } = require("./deletionTransactionGuard");

/** How long a deleted meal is kept before it is removed for good. */
const DELETED_MEAL_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const DELETED_MEAL_RETENTION_MS = DELETED_MEAL_RETENTION_DAYS * DAY_MS;

/** Meals read per page of the collection-group query. */
const PURGE_PAGE_SIZE = 500;

/** Meals one run deletes at most. A Tropos heuristic: far more than fall
 *  due in an hour, and a bound on one run; whatever is left goes in the
 *  next hour's, because a deleted meal is no longer in the query. */
const PURGE_RUN_CAP = 5000;

/** Meals deleted in one transaction, all of one account. Firestore allows
 *  500 writes; 100 keeps each transaction's locks small, since a person
 *  restoring a meal waits on them. */
const PURGE_TRANSACTION_SIZE = 100;

/** When a run stops starting transactions: a minute short of
 *  SCHEDULED_CAP's 540 s, so the run finishes and is recorded. */
const PURGE_TIME_LIMIT_MS = 480_000;

function millisOf(value) {
  return value && typeof value.toMillis === "function"
    ? value.toMillis()
    : null;
}

/** Whether a stored meal's 30 days are up (see the header for the clock). */
function isPurgeDue(data, updateTime, nowMs) {
  const deletedAtMs = millisOf(data && data.deletedAt);
  const tookMs = millisOf(updateTime);
  if (deletedAtMs === null || tookMs === null) return false;
  return nowMs >= Math.max(deletedAtMs, tookMs) + DELETED_MEAL_RETENTION_MS;
}

/** The account a `meals` document belongs to, or null for any `meals`
 *  collection that is not a person's diary. */
function mealOwner(path) {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "users" && parts[2] === "meals"
    ? parts[1]
    : null;
}

/** One transaction: the account's freeze and its meals read, then the meals
 *  still due deleted. */
async function purgeAccountMeals({ firestore, uid, refs, nowMs }) {
  return firestore.runTransaction(async (tx) => {
    if (!(await transactionAccountsLive({ firestore, tx, uids: [uid] })))
      return { purged: 0, deleting: refs.length, notDue: 0 };
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const due = snaps.filter(
      (snap) => snap.exists && isPurgeDue(snap.data(), snap.updateTime, nowMs)
    );
    for (const snap of due) tx.delete(snap.ref);
    return { purged: due.length, deleting: 0, notDue: refs.length - due.length };
  });
}

/**
 * The hourly purge. Finds the meals whose `deletedAt` is 30 days or more
 * before `nowMs`, oldest first, through a collection-group index on
 * `meals.deletedAt` (firestore.indexes.json), a page at a time, and deletes
 * them account by account. Meals it must leave (an account being deleted,
 * a meal restored meanwhile) are paged past, so they never hold up the
 * rest. It stops at PURGE_RUN_CAP meals or the time limit and says so in
 * `more`; the next run starts again from the oldest, and finds only what is
 * left. A failed query throws, so the run is recorded as failed. One
 * account's failed transaction is counted and the run goes on with the
 * others; then, if any failed, the run throws with the counts in its
 * message (and on the error's `summary`), so `jobRuns` records a failed run
 * rather than an "ok" one carrying `failed: N` that reads like a quiet hour.
 *
 * Resolves to counts only, which `jobRuns/purgeSoftDeletedMeals` keeps:
 * `read` meals found, `purged`, `deleting` (left for an account being
 * deleted), `notDue` (restored or written again meanwhile), `failed`,
 * `stoppedAtTimeLimit` and `more`.
 */
async function purgeSoftDeletedMeals({
  firestore,
  toTimestamp,
  nowMs,
  clock = Date.now,
  timeLimitMs = PURGE_TIME_LIMIT_MS,
  pageSize = PURGE_PAGE_SIZE,
  runCap = PURGE_RUN_CAP,
  transactionSize = PURGE_TRANSACTION_SIZE,
}) {
  const started = clock();
  const query = firestore
    .collectionGroup("meals")
    .where("deletedAt", "<=", toTimestamp(nowMs - DELETED_MEAL_RETENTION_MS))
    .orderBy("deletedAt")
    .limit(pageSize);

  const counts = { read: 0, purged: 0, deleting: 0, notDue: 0, failed: 0 };
  let stoppedAtTimeLimit = false;
  let more = false;
  let cursor = null;
  pages: for (;;) {
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    counts.read += page.docs.length;

    // Each account's meals on this page, in the order the page has them.
    const byAccount = new Map();
    for (const doc of page.docs) {
      const uid = mealOwner(doc.ref.path);
      if (!uid) continue;
      if (!byAccount.has(uid)) byAccount.set(uid, []);
      byAccount.get(uid).push(doc.ref);
    }

    for (const [uid, refs] of byAccount) {
      for (let i = 0; i < refs.length; i += transactionSize) {
        if (counts.purged >= runCap) {
          more = true;
          break pages;
        }
        if (clock() - started > timeLimitMs) {
          stoppedAtTimeLimit = true;
          more = true;
          break pages;
        }
        const batch = refs.slice(
          i,
          i + Math.min(transactionSize, runCap - counts.purged)
        );
        try {
          const result = await purgeAccountMeals({
            firestore,
            uid,
            refs: batch,
            nowMs,
          });
          counts.purged += result.purged;
          counts.deleting += result.deleting;
          counts.notDue += result.notDue;
        } catch (err) {
          counts.failed += batch.length;
          console.error("purgeSoftDeletedMeals: an account's meals failed", {
            message: err && err.message,
          });
        }
        // A batch cut short by the cap leaves the rest of the account's
        // meals for the next run.
        if (batch.length < Math.min(transactionSize, refs.length - i)) {
          more = true;
          break pages;
        }
      }
    }

    if (page.docs.length < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }

  const summary = { ...counts, stoppedAtTimeLimit, more };
  if (counts.failed > 0) {
    const tried = counts.failed + counts.purged + counts.notDue;
    console.error("purgeSoftDeletedMeals: meals failed", summary);
    const err = new Error(
      `purgeSoftDeletedMeals: ${counts.failed} of ${tried} meals failed; ` +
        `purged ${counts.purged}, not due ${counts.notDue}, ` +
        `left for a deletion ${counts.deleting}, read ${counts.read}`
    );
    err.summary = summary;
    throw err;
  }
  return summary;
}

module.exports = {
  DELETED_MEAL_RETENTION_DAYS,
  PURGE_PAGE_SIZE,
  PURGE_RUN_CAP,
  PURGE_TRANSACTION_SIZE,
  PURGE_TIME_LIMIT_MS,
  purgeSoftDeletedMeals,
};

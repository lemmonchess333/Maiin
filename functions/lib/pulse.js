"use strict";

/**
 * The live pulse (Soc15): how many sessions were saved for one day across
 * all of Tropos, the figure behind Social's "Today: 14 sessions on Tropos".
 *
 * WHAT IS STORED
 *
 *   pulse/{dateKey}       { sessions, updatedAt, expiresAt }
 *       one day's count, read by anyone signed in, written by nobody else
 *   users/{uid}/pulseCredits/{kind}_{sessionId}
 *       one session's credit: { kind, sessionId, dateKey, appliedAt,
 *       expiresAt }, server only, swept with the account
 *
 * The credit's id carries the session's kind because workouts and runs are
 * two collections, and nothing stops a workout and a run sharing an id
 * (programme workouts take a deterministic `programme-{completionId}`).
 *
 * WHAT COUNTS. Each session on its own `date`, the local day it started,
 * as the app saves it (sourceActivityDateKey, with the challenges' legacy
 * fallback). Only what the challenges would credit, through the friends
 * board's own helpers: every saved workout, and a run that is eligible
 * (`isVolumeEligibleRun`) and inside the shared-credit bounds
 * (`runMetersFor` is 0 past them). A restricted account adds nothing, as
 * on the community goal: a restriction refuses adding to what other people
 * see. An account being deleted adds nothing either; both are read inside
 * the transaction that would add.
 *
 * WHICH DAYS. A day is kept for eight days after it starts (`expiresAt`,
 * deleted by the TTL policy on `pulse` and `pulseCredits` in
 * firestore.indexes.json). A session takes credit only for a day the
 * clock has reached somewhere (no later than UTC's tomorrow, where UTC+14
 * already is) and that is still kept. A day past its keeping takes no more
 * credit and gives none back, so a day the TTL policy has removed is never
 * written again, and never comes back as a negative count.
 *
 * IDEMPOTENCY, as the community goal. The credit is written in the
 * transaction that adds one, so a redelivered create finds it and adds
 * nothing. The reversal reads the day off the credit (ADR-0012: read what
 * was applied, never re-derive it from a document that may have changed)
 * and deletes it in the transaction that takes one away, so a redelivered
 * delete finds nothing to undo, and a session saved again under the same
 * id counts afresh. A session deleted before its credit lands adds
 * nothing: the source is read in the same transaction.
 *
 * CONTENTION. The day's document is the one every session in Tropos
 * writes to, so it is only ever incremented, never read, inside a credit
 * (as the community goal's challenge document is): a transaction that read
 * it would hold every other person's credit up behind it. At about one
 * session a day per person, the day's document takes one write a second
 * at around 86,000 people; past that it wants splitting into shards.
 */

const { isVolumeEligibleRun } = require("./runEligibility");
const { runMetersFor } = require("./lifetimeAccrual");
const {
  isValidDateKey,
  sourceActivityDateKey,
} = require("./challengeActivityWindow");
const { transactionAccountsLive } = require("./deletionTransactionGuard");

const COLLECTION = "pulse";
const CREDITS = "pulseCredits";
const KINDS = Object.freeze(["workout", "run"]);
const DAY_MS = 86400000;
/** How long a day is kept after it starts. */
const KEEP_DAYS = 8;

function dayStartMs(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** When a day's count, and every credit for it, may be deleted. */
function pulseExpiresAt(dateKey) {
  return new Date(dayStartMs(dateKey) + KEEP_DAYS * DAY_MS);
}

/**
 * Whether a session for `dateKey` may change that day's count at `nowMs`:
 * a day some clock has reached, and one still kept.
 */
function dayIsOpen(dateKey, nowMs) {
  if (!isValidDateKey(dateKey) || !Number.isFinite(nowMs)) return false;
  const start = dayStartMs(dateKey);
  // UTC+14 is a calendar day ahead of UTC, and nowhere is further.
  if (start > nowMs + DAY_MS) return false;
  return nowMs < start + KEEP_DAYS * DAY_MS;
}

/**
 * Whether a saved session counts in the pulse: every workout, and a run
 * the challenges and the friends board would credit.
 */
function sessionCounts(kind, data) {
  if (!data) return false;
  if (kind === "workout") return true;
  if (kind === "run") return isVolumeEligibleRun(data) && runMetersFor(data) > 0;
  return false;
}

/** The person's credits. Spelled out, not built from a constant, so the
 *  account-deletion sweep's guard (accountDeletionSubcollections.test.js)
 *  can read the path. */
function credits(db, uid) {
  return db.collection("users").doc(uid).collection("pulseCredits");
}

function creditRef(db, uid, kind, sessionId) {
  return credits(db, uid).doc(`${kind}_${sessionId}`);
}

/**
 * Count one saved session in its day.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} args
 * @param {string} args.uid
 * @param {"workout"|"run"} args.kind
 * @param {string} args.sessionId
 * @param {object} args.data          the session document
 * @param {FirebaseFirestore.DocumentReference} [args.sourceRef]  the session
 * @param {{increment: Function, serverTimestamp: Function}} args.fieldValue
 * @param {number} [args.nowMs]       the event's time, the same on a retry
 * @returns {Promise<boolean>} whether this call added it
 */
async function creditSessionToPulse(
  db,
  { uid, kind, sessionId, data, sourceRef = null, fieldValue, nowMs = Date.now() }
) {
  if (!uid || !sessionId || !KINDS.includes(kind)) return false;
  if (!sessionCounts(kind, data)) return false;
  const dateKey = sourceActivityDateKey(data);
  if (!dayIsOpen(dateKey, nowMs)) return false;

  const credit = creditRef(db, uid, kind, sessionId);
  const day = db.collection(COLLECTION).doc(dateKey);
  const restricted = db.collection("globalRestrictedUids").doc(uid);
  return db.runTransaction(async (tx) => {
    const [creditSnap, restrictedSnap, sourceSnap, live] = await Promise.all([
      tx.get(credit),
      tx.get(restricted),
      sourceRef ? tx.get(sourceRef) : null,
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
    ]);
    if (creditSnap.exists) return false; // already counted
    if (restrictedSnap.exists) return false;
    if (!live) return false;
    // Deleted before this landed: its delete either committed first
    // (nothing to count) or comes after (and finds this credit).
    if (sourceSnap && !sourceSnap.exists) return false;

    const expiresAt = pulseExpiresAt(dateKey);
    tx.set(credit, {
      kind,
      sessionId,
      dateKey,
      appliedAt: fieldValue.serverTimestamp(),
      expiresAt,
    });
    tx.set(
      day,
      {
        sessions: fieldValue.increment(1),
        updatedAt: fieldValue.serverTimestamp(),
        expiresAt,
      },
      { merge: true }
    );
    return true;
  });
}

/**
 * Take one deleted session back off its day. No eligibility check: a
 * session that never counted has no credit, and the credit is the record
 * of what was added.
 *
 * @returns {Promise<boolean>} whether this call took it off
 */
async function reverseSessionFromPulse(
  db,
  { uid, kind, sessionId, fieldValue, nowMs = Date.now() }
) {
  if (!uid || !sessionId || !KINDS.includes(kind)) return false;
  const credit = creditRef(db, uid, kind, sessionId);
  return db.runTransaction(async (tx) => {
    const creditSnap = await tx.get(credit);
    if (!creditSnap.exists) return false; // never counted, or already off
    const { dateKey } = creditSnap.data() || {};
    tx.delete(credit);
    // A day past its keeping is left as it stands (see WHICH DAYS).
    if (dayIsOpen(dateKey, nowMs)) {
      tx.set(
        db.collection(COLLECTION).doc(dateKey),
        {
          sessions: fieldValue.increment(-1),
          updatedAt: fieldValue.serverTimestamp(),
          expiresAt: pulseExpiresAt(dateKey),
        },
        { merge: true }
      );
    }
    return true;
  });
}

module.exports = {
  COLLECTION,
  CREDITS,
  KEEP_DAYS,
  pulseExpiresAt,
  dayIsOpen,
  sessionCounts,
  creditSessionToPulse,
  reverseSessionFromPulse,
};

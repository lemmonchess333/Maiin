/**
 * R1A-Deletion Chunk 2 — account-deletion status / tombstone read helpers.
 *
 * This module is the single read interface every lock site consults to
 * decide whether to reject a write:
 *
 *   - Callable actor lock — reject if context.auth.uid has an active
 *     deletion (status in running / failed_cleanup / pending_cleanup /
 *     pending_auth_deletion / operator_review).
 *
 *   - Referenced-uid lock — reject if any uid referenced by a cross-user
 *     write (e.g. comment authorId, kudos giver, notification fromUserId,
 *     follow target) has an active deletion. Check happens INSIDE the
 *     write transaction at commit time, not as a pre-condition, to avoid
 *     TOCTOU races.
 *
 *   - System-writer guard — long-running scheduled/triggered functions
 *     (Apple/Stripe webhooks, performance rollups, onWorkout/onRunCreated
 *     triggers) MUST check tombstone immediately before each write commit,
 *     not only at function entry. The tombstone check covers UIDs that
 *     started deletion AFTER the function began reading.
 *
 * Tombstone vs active-deletion distinction:
 *
 *   - Active deletion: accountDeletionRequests/{uid}.status in active set.
 *     Lifetime ~minutes-to-hours (deletion in progress). Lock prevents
 *     concurrent writes that would race with the executor.
 *
 *   - Tombstone: deletedAccounts/{uid} exists and expiresAt is in the
 *     future. Lifetime 90 days post-deletion. Prevents system writers
 *     from recreating user data for an account that no longer exists.
 *
 *   - Billing-identity tombstone: deletedBillingIdentities/{hashedIdentifier}
 *     exists. Lifetime 13 months. Specific to Apple/Stripe webhook handlers
 *     that look up users by billing identifier rather than uid.
 *
 * Chunk 2 scope: read helpers + assertion functions. Firestore writes
 * to these collections happen in Chunk 3 (deleteMyAccount rewrite).
 */
"use strict";

const ledger = require("./accountDeletionLedger.js");
const tombstone = require("./deletedAccountsTombstone.js");

/**
 * Status values that indicate the account is being deleted RIGHT NOW.
 * A callable or system writer hitting one of these must reject the
 * write — the executor is mid-cascade and any new data would either
 * race the cleanup or persist orphaned after Auth deletion.
 *
 * NOT included: requested (lock not yet acquired), completed (cascade
 * finished), cancelled (user backed out). These are non-active states
 * where normal writes are safe.
 */
const ACTIVE_DELETION_STATUSES = Object.freeze([
  ledger.STATUS.RUNNING,
  ledger.STATUS.FAILED_CLEANUP,
  ledger.STATUS.PENDING_CLEANUP,
  ledger.STATUS.PENDING_AUTH_DELETION,
  ledger.STATUS.OPERATOR_REVIEW,
]);

/**
 * Maximum number of referenced UIDs a single callable invocation may
 * check in one cross-user write (per spec DoS prevention rule).
 * Larger fan-out paginates across invocations.
 */
const MAX_REFERENCED_UIDS_PER_CALL = 30;

/**
 * Stable error codes that callable clients consume to render specific
 * UX. Exported so the client can branch on errorCode rather than
 * parsing English error messages.
 */
const ERROR_CODES = Object.freeze({
  ACCOUNT_DELETING: "account-deleting",
  ACCOUNT_DELETED: "account-deleted",
  REFERENCED_ACCOUNT_DELETING: "referenced-account-deleting",
  REFERENCED_ACCOUNT_DELETED: "referenced-account-deleted",
  TOO_MANY_REFERENCES: "too-many-references",
  SYSTEM_WRITE_BLOCKED: "system-write-blocked-tombstoned",
});

/* ── Pure predicates (unit-testable without Firestore) ─────────────── */

/**
 * Returns true if the given status string represents an active
 * deletion that must block writes.
 *
 * Pure function. Null / undefined / unknown status returns false —
 * the caller decides whether absence-of-ledger is itself a reason to
 * block (it isn't for new accounts, but is for system writers checking
 * tombstones).
 */
function isStatusActive(status) {
  if (!status) return false;
  return ACTIVE_DELETION_STATUSES.includes(status);
}

/**
 * Returns true if the tombstone record is "live" (not yet expired).
 * Pure function over the tombstone doc shape; nowMs defaults to
 * Date.now() but is parameterised for tests.
 *
 * Note: a tombstone with no expiresAt is treated as live (defensive —
 * a missing TTL field means the cleanup function didn't set one;
 * better to keep blocking writes than to recreate user data prematurely).
 */
function isTombstoneLive(tombstoneDoc, nowMs) {
  if (!tombstoneDoc) return false;
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  if (!tombstoneDoc.expiresAt) return true; // missing TTL = treat as live
  const expiresMs =
    typeof tombstoneDoc.expiresAt === "number"
      ? tombstoneDoc.expiresAt
      : tombstoneDoc.expiresAt.toMillis
      ? tombstoneDoc.expiresAt.toMillis()
      : new Date(tombstoneDoc.expiresAt).getTime();
  return expiresMs > now;
}

/* ── Error factories ──────────────────────────────────────────────── */

function makeAccountDeletingError(uid) {
  const err = new Error(
    `Account ${uid} has an in-progress deletion. Writes are frozen until the deletion completes or is cancelled.`,
  );
  err.code = "failed-precondition";
  err.errorCode = ERROR_CODES.ACCOUNT_DELETING;
  err.uid = uid;
  return err;
}

function makeReferencedAccountDeletingError(referencedUid) {
  const err = new Error(
    `Cannot complete write: referenced account ${referencedUid} is being deleted.`,
  );
  err.code = "failed-precondition";
  err.errorCode = ERROR_CODES.REFERENCED_ACCOUNT_DELETING;
  err.referencedUid = referencedUid;
  return err;
}

/**
 * Actor whose deletion has COMPLETED (a live post-deletion tombstone).
 * Distinct client state from an in-progress deletion — the deletion is
 * finished but an already-issued ID token can still authenticate until
 * it expires. Kept as a separate stable errorCode so the client can
 * render "your account was deleted" rather than "deletion in progress".
 */
function makeAccountDeletedError(uid) {
  const err = new Error(
    `Account ${uid} has been deleted. Authenticated writes are no longer allowed.`,
  );
  err.code = "failed-precondition";
  err.errorCode = ERROR_CODES.ACCOUNT_DELETED;
  err.uid = uid;
  return err;
}

/**
 * Referenced (cross-user) account whose deletion has COMPLETED.
 * Counterpart to makeReferencedAccountDeletingError for the tombstone
 * state.
 */
function makeReferencedAccountDeletedError(referencedUid) {
  const err = new Error(
    `Cannot complete write: referenced account ${referencedUid} has been deleted.`,
  );
  err.code = "failed-precondition";
  err.errorCode = ERROR_CODES.REFERENCED_ACCOUNT_DELETED;
  err.referencedUid = referencedUid;
  return err;
}

function makeTooManyReferencesError(count) {
  const err = new Error(
    `Too many referenced UIDs in one call: ${count} (max ${MAX_REFERENCED_UIDS_PER_CALL}). Paginate the operation across multiple invocations.`,
  );
  err.code = "invalid-argument";
  err.errorCode = ERROR_CODES.TOO_MANY_REFERENCES;
  return err;
}

function makeSystemWriteBlockedError(uid) {
  const err = new Error(
    `System write to account ${uid} blocked by tombstone — account has been deleted.`,
  );
  err.code = "failed-precondition";
  err.errorCode = ERROR_CODES.SYSTEM_WRITE_BLOCKED;
  err.uid = uid;
  return err;
}

/* ── Firestore-reading helpers (wired in Chunk 2 lock sites) ───────── */

/**
 * Read accountDeletionRequests/{uid}. Returns the doc data or null.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {string} uid
 * @returns {Promise<object | null>}
 */
async function readDeletionStatusDoc(db, uid) {
  if (!uid || typeof uid !== "string") return null;
  const snap = await db.collection(ledger.COLLECTION).doc(uid).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Read deletedAccounts/{uid}. Returns the tombstone doc or null.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {string} uid
 * @returns {Promise<object | null>}
 */
async function readTombstoneDoc(db, uid) {
  if (!uid || typeof uid !== "string") return null;
  const snap = await db.collection(tombstone.COLLECTION).doc(uid).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Check whether a single uid has an active deletion in progress.
 *
 * @returns {Promise<boolean>}
 */
async function isAccountDeleting(db, uid) {
  const doc = await readDeletionStatusDoc(db, uid);
  return isStatusActive(doc && doc.status);
}

/**
 * Check whether a uid is in the deletedAccounts tombstone (and the
 * tombstone is not expired).
 */
async function isTombstoned(db, uid) {
  const doc = await readTombstoneDoc(db, uid);
  return isTombstoneLive(doc);
}

/**
 * Throw if the actor uid is not writable. Used by callable functions at
 * entry to gate user-write paths.
 *
 * Two distinct non-writable states, each with its own stable errorCode:
 *   - active deletion (executor mid-cascade)  → account-deleting
 *   - live post-deletion tombstone (completed) → account-deleted
 *
 * The tombstone case is what makes a COMPLETED deletion irreversible: an
 * already-issued ID token can still authenticate until it expires, and
 * without this check that token could recreate user data after deletion.
 * This brings the callable-actor guard in line with the system-writer
 * guard (assertUserWritableBySystem), which already rejects both states.
 *
 * The deletion executor (deleteMyAccount) and the cancel callable
 * (cancelDeletionRequest) are exempt — they're the only callables
 * allowed to operate ON a deleting account.
 *
 * Name retained (assertAccountNotDeleting) so every existing lock wrapper
 * keeps working; "NotDeleting" now means the full writable-account
 * contract.
 */
async function assertAccountNotDeleting(db, uid) {
  if (await isAccountDeleting(db, uid)) {
    throw makeAccountDeletingError(uid);
  }
  if (await isTombstoned(db, uid)) {
    throw makeAccountDeletedError(uid);
  }
}

/**
 * Throw if ANY uid in the referenced list has an active deletion.
 *
 * For cross-user writes (comment with authorId pointing at someone
 * else; kudos giver writing on a target's activity; follow edge
 * touching both follower and following uids; notification with
 * fromUserId/targetUserId). The transactional caller wraps both this
 * assertion AND the write inside db.runTransaction() to close the
 * TOCTOU window — if the referenced account starts deleting between
 * the check and the write, the transaction sees the new status and
 * the executor either has already reverted the partial write or will
 * sweep it next cleanup pass.
 *
 * DoS protection: hard cap at MAX_REFERENCED_UIDS_PER_CALL UIDs.
 * Batched read uses getAll() so the per-uid Firestore round-trips are
 * amortised across one network call.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {string[]} uids
 */
async function assertNoReferencedAccountsDeleting(db, uids) {
  if (!Array.isArray(uids)) return;
  // De-duplicate and filter empty/falsy values up front.
  const unique = [...new Set(uids.filter((u) => typeof u === "string" && u.length > 0))];
  if (unique.length === 0) return;
  if (unique.length > MAX_REFERENCED_UIDS_PER_CALL) {
    throw makeTooManyReferencesError(unique.length);
  }
  // getAll() is the Admin SDK's batched-read primitive. It accepts a
  // splatted list of DocumentReferences and returns DocumentSnapshots in
  // the same order. Read both the active-deletion ledger AND the
  // post-deletion tombstone for each referenced uid in one round-trip:
  // a referenced account that is being deleted OR has been deleted must
  // block the cross-user write.
  const deletionRefs = unique.map((uid) =>
    db.collection(ledger.COLLECTION).doc(uid),
  );
  const tombstoneRefs = unique.map((uid) =>
    db.collection(tombstone.COLLECTION).doc(uid),
  );
  const snaps = await db.getAll(...deletionRefs, ...tombstoneRefs);
  // First half: active-deletion status docs.
  for (const snap of snaps.slice(0, unique.length)) {
    if (!snap.exists) continue;
    const data = snap.data();
    if (isStatusActive(data && data.status)) {
      throw makeReferencedAccountDeletingError(snap.id);
    }
  }
  // Second half: post-deletion tombstones (same uid order).
  for (const snap of snaps.slice(unique.length)) {
    if (!snap.exists) continue;
    if (isTombstoneLive(snap.data())) {
      throw makeReferencedAccountDeletedError(snap.id);
    }
  }
}

/**
 * System-writer guard: throw if the target uid is in the deletedAccounts
 * tombstone OR has an active deletion. Used by webhooks and scheduled
 * functions immediately before each write commit (per
 * designConstants.systemWriterCheckTiming).
 *
 * Why both checks: an active deletion (executor mid-cascade) is the
 * window when a system writer must not recreate data. A tombstone
 * (account already deleted) is the long-term signal. Both must block.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {string} uid
 * @param {string} reason  Optional context for diagnostic logging.
 */
async function assertUserWritableBySystem(db, uid, reason) {
  if (!uid || typeof uid !== "string") {
    // Defensive: a system writer with no target uid should be a no-op.
    return;
  }
  // Active deletion check first (cheaper if it short-circuits; the
  // executor is the dominant cause of system-write blocks during
  // deletion).
  if (await isAccountDeleting(db, uid)) {
    const err = makeSystemWriteBlockedError(uid);
    err.reason = reason;
    err.kind = "active-deletion";
    throw err;
  }
  if (await isTombstoned(db, uid)) {
    const err = makeSystemWriteBlockedError(uid);
    err.reason = reason;
    err.kind = "tombstone";
    throw err;
  }
}

module.exports = {
  ACTIVE_DELETION_STATUSES,
  MAX_REFERENCED_UIDS_PER_CALL,
  ERROR_CODES,
  isStatusActive,
  isTombstoneLive,
  makeAccountDeletingError,
  makeAccountDeletedError,
  makeReferencedAccountDeletingError,
  makeReferencedAccountDeletedError,
  makeTooManyReferencesError,
  makeSystemWriteBlockedError,
  readDeletionStatusDoc,
  readTombstoneDoc,
  isAccountDeleting,
  isTombstoned,
  assertAccountNotDeleting,
  assertNoReferencedAccountsDeleting,
  assertUserWritableBySystem,
};

/**
 * R1A-Deletion — operational ledger / lease execution schema.
 *
 * Chunk 1 scope: schema constants + helper signatures only. No call
 * site wires this in yet — Chunk 3 (deletion path rewrite) attaches
 * lease acquisition to deleteMyAccount and the worker-style retry
 * paths.
 *
 * Lifetime contract:
 *   - Lease acquired in a Firestore transaction at deletion start.
 *   - leaseGeneration monotonically increments on every takeover.
 *   - Cleanup work checks generation at chunk start and aborts if
 *     superseded — protects against split-brain when an expired
 *     lease is taken over by a retry.
 *   - Status transitions are restricted to the explicit STATE_GRAPH
 *     below; any other transition throws.
 *   - cleanupAfter (timestamp) feeds Firestore TTL for ledger expiry
 *     — 30 days post-completion. Founder must enable the TTL policy
 *     in the Firebase console for the cleanupAfter field on the
 *     accountDeletionRequests collection.
 *
 * Privacy contract:
 *   - This is an OPERATIONAL ledger, not a user record. The schema
 *     forbids names, email, macros, routes, photos, social data.
 *     See ALLOWED_FIELDS below.
 */
"use strict";

const STATUS = Object.freeze({
  REQUESTED: "requested",
  RUNNING: "running",
  FAILED_CLEANUP: "failed_cleanup",
  PENDING_CLEANUP: "pending_cleanup",
  PENDING_AUTH_DELETION: "pending_auth_deletion",
  OPERATOR_REVIEW: "operator_review",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
});

/**
 * Allowed transitions. Keys are FROM, values are arrays of valid TO.
 * applyTransition() throws on any unmapped transition.
 */
const STATE_GRAPH = Object.freeze({
  [STATUS.REQUESTED]: [STATUS.RUNNING, STATUS.CANCELLED],
  [STATUS.RUNNING]: [
    STATUS.COMPLETED,
    STATUS.FAILED_CLEANUP,
    STATUS.PENDING_CLEANUP,
    STATUS.PENDING_AUTH_DELETION,
    STATUS.OPERATOR_REVIEW,
  ],
  [STATUS.FAILED_CLEANUP]: [
    STATUS.RUNNING,
    STATUS.OPERATOR_REVIEW,
    STATUS.CANCELLED,
  ],
  [STATUS.PENDING_CLEANUP]: [
    STATUS.RUNNING,
    STATUS.OPERATOR_REVIEW,
    STATUS.CANCELLED,
  ],
  [STATUS.PENDING_AUTH_DELETION]: [STATUS.COMPLETED, STATUS.OPERATOR_REVIEW],
  [STATUS.OPERATOR_REVIEW]: [STATUS.RUNNING, STATUS.CANCELLED],
  [STATUS.CANCELLED]: [],
  [STATUS.COMPLETED]: [],
});

/**
 * Strictly-allowed fields on accountDeletionRequests/{uid}.
 * The minimisation rule for operational records: nothing here may
 * carry personal data. Adding a field requires updating both this
 * allowlist and the Phase 1 inventory minimisation note.
 */
const ALLOWED_FIELDS = Object.freeze([
  "uid",
  "status",
  "operationId",
  "supportCode",
  "leaseOwner",
  "leaseExpiresAt",
  "leaseGeneration",
  "lastHeartbeatAt",
  "attemptCount",
  "startedAt",
  "updatedAt",
  "completedAt",
  "expiresAt",
  "cleanupAfter",
  "failedStage",
  "lastErrorCode",
  "lastErrorMessage",
  "cleanupSummary",
  "pendingCleanupShards",
]);

const COLLECTION = "accountDeletionRequests";

const LEASE_DURATION_MS = 540 * 1000; // matches max gen2 callable timeout
const LEDGER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * User-safe support code. Maps server-side to operationId/uid for
 * support triage. No personal info encoded — the alphabet excludes
 * easily-confused characters (0/O, 1/I/L) so users can dictate over
 * the phone.
 *
 * Format: DL-XXXXXX where each X is a chosen character.
 */
const SUPPORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateSupportCode(rng) {
  const random = rng || ((n) => Math.floor(Math.random() * n));
  let code = "DL-";
  for (let i = 0; i < 6; i++) {
    code += SUPPORT_CODE_ALPHABET[random(SUPPORT_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Validate a transition is permitted by STATE_GRAPH. Pure function
 * for unit-test pinning — does not touch Firestore.
 */
function assertValidTransition(fromStatus, toStatus) {
  const allowed = STATE_GRAPH[fromStatus];
  if (!allowed) {
    throw new Error(`unknown source status: ${fromStatus}`);
  }
  if (!allowed.includes(toStatus)) {
    throw new Error(
      `disallowed transition: ${fromStatus} -> ${toStatus} (allowed: ${allowed.join(", ")})`,
    );
  }
}

/**
 * Validate that a record body only contains allowlisted fields. Pure.
 */
function assertMinimisedRecord(record) {
  for (const field of Object.keys(record)) {
    if (!ALLOWED_FIELDS.includes(field)) {
      throw new Error(
        `forbidden field on accountDeletionRequests: ${field} (operational ledger must not carry personal data)`,
      );
    }
  }
}

// ── Chunk 3 — transactional lease + state-machine implementation ───
//
// The write-freeze (firestore.rules isDeleting) engages the moment
// accountDeletionRequests/{uid}.status enters the active set. acquireLease
// SETs status='running' transactionally at deletion start; transitionStatus
// moves it to a terminal (completed) or frozen-retryable (failed_cleanup)
// state; verifyLeaseGeneration guards the irreversible steps against a
// takeover. `now` is injected (ms) for deterministic tests.

const crypto = require("crypto");

/** Terminal statuses — a finished operation; a new request re-initialises. */
const TERMINAL_STATUSES = Object.freeze([STATUS.COMPLETED, STATUS.CANCELLED]);

function ledgerRef(firestore, uid) {
  return firestore.collection(COLLECTION).doc(uid);
}

/**
 * Acquire (or take over) the deletion lease for `uid` transactionally and
 * engage the write-freeze (status='running'). Monotonic `leaseGeneration`
 * increments on every takeover so a superseded executor can detect it and
 * abort (split-brain protection). Returns:
 *   { acquired: true,  generation, status }              — go
 *   { acquired: false, reason: 'leased', generation }    — another live owner
 */
async function acquireLease({
  firestore,
  uid,
  leaseOwner,
  now = Date.now(),
  leaseDurationMs = LEASE_DURATION_MS,
  generateOperationId = () => crypto.randomUUID(),
  generateSupportCodeFn = () => generateSupportCode(),
}) {
  if (!firestore) throw new Error("acquireLease: firestore handle required");
  if (!uid) throw new Error("acquireLease: uid required");
  if (!leaseOwner) throw new Error("acquireLease: leaseOwner required");
  const ref = ledgerRef(firestore, uid);
  const leaseExpiresAt = now + leaseDurationMs;

  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : null;

    // Fresh operation: no doc, or a prior terminal record we overwrite.
    if (!data || TERMINAL_STATUSES.includes(data.status)) {
      const record = {
        uid,
        status: STATUS.RUNNING,
        operationId: generateOperationId(),
        supportCode: generateSupportCodeFn(),
        leaseOwner,
        leaseGeneration: 1,
        leaseExpiresAt,
        lastHeartbeatAt: now,
        attemptCount: 1,
        startedAt: now,
        updatedAt: now,
      };
      assertMinimisedRecord(record);
      tx.set(ref, record);
      return { acquired: true, generation: 1, status: STATUS.RUNNING };
    }

    // Active operation. A non-expired lease held by a DIFFERENT owner blocks us.
    const currentExpiry = Number(data.leaseExpiresAt) || 0;
    if (
      data.leaseOwner &&
      data.leaseOwner !== leaseOwner &&
      currentExpiry > now
    ) {
      return {
        acquired: false,
        reason: "leased",
        generation: Number(data.leaseGeneration) || 0,
      };
    }

    // Takeover (expired lease) or re-entrant (same owner): bump generation and
    // re-arm the lease. Transition to running if the op had stalled in another
    // active status (STATE_GRAPH-validated); a running→running takeover is a
    // lease re-arm, not a status change, so it skips the transition check.
    const nextGen = (Number(data.leaseGeneration) || 0) + 1;
    const update = {
      leaseOwner,
      leaseGeneration: nextGen,
      leaseExpiresAt,
      lastHeartbeatAt: now,
      updatedAt: now,
      attemptCount: (Number(data.attemptCount) || 0) + 1,
    };
    if (data.status !== STATUS.RUNNING) {
      assertValidTransition(data.status, STATUS.RUNNING);
      update.status = STATUS.RUNNING;
    }
    assertMinimisedRecord(update);
    tx.set(ref, update, { merge: true });
    return { acquired: true, generation: nextGen, status: STATUS.RUNNING };
  });
}

/**
 * Extend our lease if we still own it at the expected generation. A no-op
 * that returns { renewed: false } when superseded, so a long cascade can bail.
 */
async function renewLease({
  firestore,
  uid,
  leaseOwner,
  expectedGeneration,
  now = Date.now(),
  leaseDurationMs = LEASE_DURATION_MS,
}) {
  const ref = ledgerRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { renewed: false, reason: "missing" };
    const data = snap.data() || {};
    if (
      data.leaseOwner !== leaseOwner ||
      Number(data.leaseGeneration) !== Number(expectedGeneration)
    ) {
      return { renewed: false, reason: "superseded" };
    }
    const update = {
      leaseExpiresAt: now + leaseDurationMs,
      lastHeartbeatAt: now,
      updatedAt: now,
    };
    assertMinimisedRecord(update);
    tx.set(ref, update, { merge: true });
    return { renewed: true, generation: Number(data.leaseGeneration) };
  });
}

/** True iff the ledger doc still carries our expected leaseGeneration. */
async function verifyLeaseGeneration({ firestore, uid, expectedGeneration }) {
  const snap = await ledgerRef(firestore, uid).get();
  if (!snap.exists) return false;
  return Number((snap.data() || {}).leaseGeneration) === Number(expectedGeneration);
}

/**
 * Move the operation to `toStatus`, validated by STATE_GRAPH, transactionally.
 * A generation mismatch (a takeover happened) is a no-op returning
 * { transitioned: false, reason: 'superseded' } — the taker owns the state.
 */
async function transitionStatus({
  firestore,
  uid,
  toStatus,
  expectedGeneration,
  extraFields = {},
  now = Date.now(),
}) {
  const ref = ledgerRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error(`transitionStatus: no deletion request for ${uid}`);
    }
    const data = snap.data() || {};
    if (
      expectedGeneration !== undefined &&
      Number(data.leaseGeneration) !== Number(expectedGeneration)
    ) {
      return {
        transitioned: false,
        reason: "superseded",
        generation: Number(data.leaseGeneration),
      };
    }
    assertValidTransition(data.status, toStatus);
    const update = { status: toStatus, updatedAt: now, ...extraFields };
    assertMinimisedRecord(update);
    tx.set(ref, update, { merge: true });
    return { transitioned: true, generation: Number(data.leaseGeneration) };
  });
}

/** Read the operational ledger doc (or null). */
async function getDeletionStatus({ firestore, uid }) {
  const snap = await ledgerRef(firestore, uid).get();
  if (!snap.exists) return null;
  return snap.data();
}

module.exports = {
  STATUS,
  STATE_GRAPH,
  ALLOWED_FIELDS,
  COLLECTION,
  LEASE_DURATION_MS,
  LEDGER_RETENTION_MS,
  TERMINAL_STATUSES,
  SUPPORT_CODE_ALPHABET,
  generateSupportCode,
  assertValidTransition,
  assertMinimisedRecord,
  acquireLease,
  renewLease,
  verifyLeaseGeneration,
  transitionStatus,
  getDeletionStatus,
};

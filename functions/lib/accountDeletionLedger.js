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

// ── Helper signatures (stub bodies — wired in Chunk 3) ─────────────
//
// Each function has a deliberate "not-implemented" throw so accidental
// import-and-call from another module surfaces immediately. Chunk 3
// replaces the bodies with the transactional implementations.

function acquireLeaseStub() {
  throw new Error("R1A-Deletion: acquireLease() lands in Chunk 3");
}

function renewLeaseStub() {
  throw new Error("R1A-Deletion: renewLease() lands in Chunk 3");
}

function verifyLeaseGenerationStub() {
  throw new Error("R1A-Deletion: verifyLeaseGeneration() lands in Chunk 3");
}

function transitionStatusStub() {
  throw new Error("R1A-Deletion: transitionStatus() lands in Chunk 3");
}

function getDeletionStatusStub() {
  throw new Error("R1A-Deletion: getDeletionStatus() lands in Chunk 3");
}

module.exports = {
  STATUS,
  STATE_GRAPH,
  ALLOWED_FIELDS,
  COLLECTION,
  LEASE_DURATION_MS,
  LEDGER_RETENTION_MS,
  SUPPORT_CODE_ALPHABET,
  generateSupportCode,
  assertValidTransition,
  assertMinimisedRecord,
  acquireLease: acquireLeaseStub,
  renewLease: renewLeaseStub,
  verifyLeaseGeneration: verifyLeaseGenerationStub,
  transitionStatus: transitionStatusStub,
  getDeletionStatus: getDeletionStatusStub,
};

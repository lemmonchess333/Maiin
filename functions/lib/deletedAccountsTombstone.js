/**
 * R1A-Deletion — long-term tombstone for deleted accounts.
 *
 * Chunk 1 scope: schema + check-helper signatures. Tombstone writing
 * lands in Chunk 3 alongside deleteMyAccount rewrite; tombstone
 * reading is consumed by every system writer in Chunk 2 (Apple IAP
 * webhook, Stripe webhook, Firestore triggers, scheduled rollups).
 *
 * Why both ledger AND tombstone:
 *   - accountDeletionRequests/{uid} is OPERATIONAL — short retention
 *     (30d), tracks lease/status, includes failure diagnostics.
 *   - deletedAccounts/{uid} is the LONG-TERM signal that "this uid
 *     was deleted, do not recreate" — bounded 90d retention covers
 *     monthly Apple billing cycle + late Stripe webhook retries.
 *   - After tombstone TTL expires, system writes for that uid are
 *     treated as new account creation attempts (which fail because
 *     the Auth user is gone).
 *
 * Privacy: uid alone is a personal identifier under GDPR. Tombstone
 * retention is bounded for that reason; indefinite retention would
 * itself be a compliance issue. The minimisation rule below excludes
 * any non-uid profile data.
 */
"use strict";

const COLLECTION = "deletedAccounts";

const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Strict allowlist for tombstone records. Adding a field requires
 * updating this list AND the inventory entry in
 * accountDeletionInventory.json (deletedAccountsTombstone).
 */
const ALLOWED_FIELDS = Object.freeze([
  "uid",
  "deletedAt",
  "expiresAt",
  "source",
  "billingRetention",
]);

const VALID_SOURCES = Object.freeze(["accountDeletion"]);

function assertMinimisedTombstone(record) {
  for (const field of Object.keys(record)) {
    if (!ALLOWED_FIELDS.includes(field)) {
      throw new Error(
        `forbidden field on deletedAccounts tombstone: ${field} (must contain only operational identity, no profile data)`,
      );
    }
  }
  if (record.source && !VALID_SOURCES.includes(record.source)) {
    throw new Error(
      `invalid tombstone source: ${record.source} (allowed: ${VALID_SOURCES.join(", ")})`,
    );
  }
}

// ── Helper signatures (stub bodies — wired in Chunk 2/3) ───────────

function writeTombstoneStub() {
  throw new Error("R1A-Deletion: writeTombstone() lands in Chunk 3");
}

function isTombstonedStub() {
  throw new Error("R1A-Deletion: isTombstoned() lands in Chunk 2");
}

module.exports = {
  COLLECTION,
  TOMBSTONE_RETENTION_MS,
  ALLOWED_FIELDS,
  VALID_SOURCES,
  assertMinimisedTombstone,
  writeTombstone: writeTombstoneStub,
  isTombstoned: isTombstonedStub,
};

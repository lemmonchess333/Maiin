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

// ── Writer + reader (R1A Chunk 3 — the production tombstone path) ───

/**
 * Build the minimal tombstone record. Only the allowlisted operational
 * identity fields; no profile data (see the privacy note above).
 */
function makeTombstone({ uid, now = Date.now() }) {
  if (typeof uid !== "string" || uid.length === 0) {
    throw new Error("makeTombstone: uid is required");
  }
  if (!Number.isFinite(now)) {
    throw new Error("makeTombstone: now must be a finite millisecond timestamp");
  }

  // Firestore TTL requires a Firestore timestamp/date field, not a number.
  // Date is accepted by the Admin SDK and remains easy to inspect in tests.
  const record = {
    uid,
    deletedAt: new Date(now),
    expiresAt: new Date(now + TOMBSTONE_RETENTION_MS),
    source: "accountDeletion",
  };

  assertMinimisedTombstone(record);
  return record;
}

/**
 * Durably commit the tombstone at deletedAccounts/{uid}. MUST be awaited
 * before auth.deleteUser so a still-valid ID token can't recreate data in
 * the interval between Auth deletion and this write. Never best-effort: a
 * failure here must abort the deletion (leaving Auth intact for retry).
 */
async function writeTombstone({ firestore, uid, now = Date.now() }) {
  if (!firestore || typeof firestore.collection !== "function") {
    throw new Error("writeTombstone: firestore handle required");
  }

  const record = makeTombstone({ uid, now });
  await firestore.collection(COLLECTION).doc(uid).set(record);
  return record;
}

/**
 * Background-writer read gate. A physically-present tombstone with a missing
 * OR malformed expiry is treated as LIVE (fail-closed); only a well-formed,
 * already-expired expiry is dead. The Firestore Rules gate is existence-only
 * (see the packet note) — this expiry-aware variant is for server writers.
 */
async function isTombstoned(firestore, uid, now = Date.now()) {
  if (!firestore || typeof firestore.collection !== "function") {
    throw new Error("isTombstoned: firestore handle required");
  }

  const snap = await firestore.collection(COLLECTION).doc(uid).get();
  if (!snap.exists) return false;

  const record = snap.data() || {};
  if (!record.expiresAt) return true;

  const expiresAt =
    typeof record.expiresAt.toMillis === "function"
      ? record.expiresAt.toMillis()
      : new Date(record.expiresAt).getTime();

  return !Number.isFinite(expiresAt) || expiresAt > now;
}

module.exports = {
  COLLECTION,
  TOMBSTONE_RETENTION_MS,
  ALLOWED_FIELDS,
  VALID_SOURCES,
  assertMinimisedTombstone,
  makeTombstone,
  writeTombstone,
  isTombstoned,
};

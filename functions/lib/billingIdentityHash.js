/**
 * R1A-Deletion Chunk 2.D-billing — billing-identity HMAC hashing.
 *
 * Per decision-log #4 update: billing tombstones use HMAC-SHA256 with
 * a server-side secret (billing.hmac_secret) instead of plain SHA-256.
 *
 * Rationale (corrected from Chunk 2.C):
 * Apple `originalTransactionId` is a 13-19 digit opaque numeric. The
 * earlier plain-SHA-256 reasoning relied on online-probe resistance
 * (~317 years at 1ms/probe), which is irrelevant to the actual threat
 * model — exposure of the `deletedBillingIdentities` collection via
 * Firestore export, backup, log access, or admin-readable dataset
 * would allow offline brute-force of the numeric key space. A 13-digit
 * lower bound (10^13 candidates) is genuinely crackable offline with
 * modern hardware on plain SHA-256.
 *
 * HMAC fixes this: without `billing.hmac_secret` the attacker cannot
 * compute candidate hashes, so even with full read access to the
 * tombstone collection there's no offline shortcut.
 *
 * Operational contract:
 *   - `BILLING_HMAC_SECRET` MUST be provisioned as a Secret Manager
 *     secret (firebase-functions/params `defineSecret`) and bound to
 *     any callable that reads or writes billing tombstones before that
 *     code path runs in production.
 *   - Missing secret = deploy-time misconfiguration. The helper throws
 *     a specific error with the provisioning command in the message.
 *   - The restore-purchase site catches the throw, logs structured
 *     warning, and returns the generic `restore-unavailable` error
 *     (fail-closed for users, visible to operator).
 *
 * Rotation contract:
 *   - Per decision-log #11, rotation strategy is store secretVersion
 *     with tombstones + try active + previous secrets during the 13mo
 *     retention window. Chunk 3 executor (which writes tombstones)
 *     stores `secretVersion` on each tombstone doc. This module
 *     exposes a lookup that tries the active secret first and falls
 *     back to a previous secret if the active lookup misses.
 *   - Single-secret deployment (no rotation yet) skips the
 *     `BILLING_PREVIOUS_HMAC_SECRET` secret entirely.
 *
 * Tests: src/lib/__tests__/accountDeletionBillingHash.test.ts
 */
"use strict";

const crypto = require("crypto");

/**
 * Read the active billing HMAC secret from the runtime environment.
 * Returns null when the secret is unavailable — caller decides what to
 * do (typically: throw, or skip the lookup with a structured warning).
 *
 * Source is process.env.BILLING_HMAC_SECRET, populated by the
 * firebase-functions/params `defineSecret("BILLING_HMAC_SECRET")`
 * binding on the callables that perform billing-tombstone lookups
 * (restoreApplePurchases). Pre-v7 this read functions.config().billing;
 * that runtime-config API was removed in firebase-functions v7. Reading
 * process.env keeps this module importable from unit tests without
 * booting firebase-functions.
 */
function getBillingHmacSecret() {
  return process.env.BILLING_HMAC_SECRET || null;
}

/**
 * Read the previous billing HMAC secret used for rotation-window
 * lookups. Returns null when no rotation is in progress. Sourced from
 * process.env.BILLING_PREVIOUS_HMAC_SECRET (defineSecret binding).
 */
function getPreviousBillingHmacSecret() {
  return process.env.BILLING_PREVIOUS_HMAC_SECRET || null;
}

/**
 * Pure HMAC computation. Exposes the secret parameter so unit tests
 * can pin behaviour without booting firebase-functions config.
 */
function computeBillingHash(provider, identifier, secret) {
  if (!provider || typeof provider !== "string") {
    throw new Error("billingIdentityHash: provider is required");
  }
  if (!identifier || typeof identifier !== "string") {
    throw new Error("billingIdentityHash: identifier is required");
  }
  if (!secret || typeof secret !== "string") {
    throw makeSecretMissingError();
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`${provider}:${identifier}`)
    .digest("hex");
}

/**
 * Production helper: read secret from the runtime env and compute the
 * tombstone key for a billing identity. Throws a specific error if the
 * secret isn't provisioned — operator must run:
 *
 *   firebase functions:secrets:set BILLING_HMAC_SECRET
 */
function billingIdentityHash(provider, identifier) {
  const secret = getBillingHmacSecret();
  return computeBillingHash(provider, identifier, secret);
}

/**
 * Rotation-aware lookup keys: returns the active hash AND the previous
 * hash (if rotation is in progress). Caller checks Firestore for both
 * — a tombstone written under the previous secret is still valid until
 * its TTL expires.
 *
 * Returns array shape so the caller can `for-of` without branching:
 *   [activeHash] when no rotation
 *   [activeHash, previousHash] when rotation is in progress
 */
function billingIdentityLookupHashes(provider, identifier) {
  const active = getBillingHmacSecret();
  if (!active) throw makeSecretMissingError();
  const previous = getPreviousBillingHmacSecret();
  const result = [computeBillingHash(provider, identifier, active)];
  if (previous && previous !== active) {
    result.push(computeBillingHash(provider, identifier, previous));
  }
  return result;
}

function makeSecretMissingError() {
  const err = new Error(
    "BILLING_HMAC_SECRET not provisioned. Run: firebase functions:secrets:set BILLING_HMAC_SECRET (32-byte-hex value)",
  );
  err.code = "failed-precondition";
  err.errorCode = "billing-hmac-secret-missing";
  return err;
}

module.exports = {
  getBillingHmacSecret,
  getPreviousBillingHmacSecret,
  computeBillingHash,
  billingIdentityHash,
  billingIdentityLookupHashes,
  makeSecretMissingError,
};

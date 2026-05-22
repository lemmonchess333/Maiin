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
 *   - `billing.hmac_secret` MUST be provisioned via Firebase Functions
 *     config before any code path that reads or writes billing
 *     tombstones runs in production.
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
 *     `previous_hmac_secret` config entry entirely.
 *
 * Tests: src/lib/__tests__/accountDeletionBillingHash.test.ts
 */
"use strict";

const crypto = require("crypto");

/**
 * Read the active billing HMAC secret from Firebase Functions config.
 * Returns null when the secret is unavailable — caller decides what to
 * do (typically: throw, or skip the lookup with a structured warning).
 *
 * Wrapped in try/catch so this module is importable from unit-test
 * contexts that don't have firebase-functions installed.
 */
function getBillingHmacSecret() {
  try {
    // Lazy require so unit tests can mock or skip this branch.
    const functions = require("firebase-functions");
    const cfg = functions.config && functions.config();
    return (cfg && cfg.billing && cfg.billing.hmac_secret) || null;
  } catch (_err) {
    return null;
  }
}

/**
 * Read the previous billing HMAC secret used for rotation-window
 * lookups. Returns null when no rotation is in progress.
 */
function getPreviousBillingHmacSecret() {
  try {
    const functions = require("firebase-functions");
    const cfg = functions.config && functions.config();
    return (cfg && cfg.billing && cfg.billing.previous_hmac_secret) || null;
  } catch (_err) {
    return null;
  }
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
 * Production helper: read secret from Functions config and compute the
 * tombstone key for a billing identity. Throws a specific error if the
 * secret isn't provisioned — operator must run:
 *
 *   firebase functions:config:set billing.hmac_secret="<32-byte-hex>"
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
    "billing.hmac_secret not provisioned. Run: firebase functions:config:set billing.hmac_secret=\"<32-byte-hex>\"",
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

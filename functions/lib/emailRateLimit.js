"use strict";

const crypto = require("crypto");
const rateLimiter = require("../rateLimiter");

/**
 * The password-reset limiter's key: a hash of the address, never the
 * address. The person is signed out, so there is no uid to key by. The key
 * was the address itself (`pwreset_alice_example_com`), kept for good and
 * reached by no deletion, for every address anyone typed. With the hash,
 * and the expiry every rateLimits record now carries, the record says only
 * that some address asked in the last few minutes.
 */
function passwordResetKey(email) {
  const hash = crypto
    .createHash("sha256")
    .update(String(email).trim().toLowerCase())
    .digest("hex");
  return `pwreset_${hash.slice(0, 32)}`;
}

/**
 * Small named adapter for the account-email callables.
 *
 * The shared limiter's first argument is ALWAYS the Firestore handle
 * (`rateLimiter.isRateLimited(db, uid, action, maxCalls, windowMs)`). The
 * password-reset / verification callables previously called it with the key
 * string in that slot, so `db.collection(...)` threw a TypeError BEFORE the
 * limiter's fail-closed try/catch could convert it — breaking both flows on
 * every request. This adapter makes the handle a named field and validates it
 * up front, so a future four-argument regression fails loudly here instead of
 * silently shifting arguments.
 */
async function isEmailRateLimited({
  firestore,
  key,
  action,
  maxCalls,
  windowMs,
  limiter = rateLimiter,
}) {
  if (!firestore || typeof firestore.collection !== "function") {
    throw new Error("isEmailRateLimited: Firestore handle required");
  }
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("isEmailRateLimited: key required");
  }

  return limiter.isRateLimited(firestore, key, action, maxCalls, windowMs);
}

module.exports = { isEmailRateLimited, passwordResetKey };

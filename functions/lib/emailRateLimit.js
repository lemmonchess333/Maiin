"use strict";

const rateLimiter = require("../rateLimiter");

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

module.exports = { isEmailRateLimited };

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

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * The windows each account email is limited by, per address or account,
 * shortest first. The short window stops a burst; the day window caps how
 * many emails one inbox can be sent, which the short window alone left at
 * hundreds a day for anyone willing to wait between requests.
 *
 * `message` is what the person is told when that window refuses. The
 * client passes a "Too many" message through as written
 * (accountSecurity.ts, Login.tsx), so it has to say when to try again.
 */
const PASSWORD_RESET_LIMITS = Object.freeze([
  {
    action: "passwordReset",
    maxCalls: 5,
    windowMs: 5 * MINUTE_MS,
    message: "Too many reset requests. Try again in a few minutes.",
  },
  {
    action: "passwordResetDay",
    maxCalls: 3,
    windowMs: DAY_MS,
    message:
      "Too many reset requests for this address today. Try again tomorrow.",
  },
]);

const VERIFICATION_EMAIL_LIMITS = Object.freeze([
  {
    action: "verificationEmail",
    maxCalls: 3,
    windowMs: 10 * MINUTE_MS,
    message: "Too many requests. Try again in a few minutes.",
  },
  {
    action: "verificationEmailDay",
    maxCalls: 5,
    windowMs: DAY_MS,
    message: "Too many requests today. Try again tomorrow.",
  },
]);

/**
 * Check `key` against each window in turn and return the first that
 * refuses, or null when all allow it. Each window counts a request when it
 * allows it, and the check stops at the first refusal, so a request the
 * short window turns away is not counted against the day.
 */
async function firstEmailLimitHit({ firestore, key, limits, limiter }) {
  for (const limit of limits) {
    const limited = await isEmailRateLimited({
      firestore,
      key,
      action: limit.action,
      maxCalls: limit.maxCalls,
      windowMs: limit.windowMs,
      limiter,
    });
    if (limited) return limit;
  }
  return null;
}

module.exports = {
  isEmailRateLimited,
  firstEmailLimitHit,
  passwordResetKey,
  PASSWORD_RESET_LIMITS,
  VERIFICATION_EMAIL_LIMITS,
  DAY_MS,
};

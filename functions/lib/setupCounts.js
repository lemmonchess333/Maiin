"use strict";

/**
 * Setup counts (owner, 23 November 2026): how many times a day the welcome
 * was shown, setup was started and an account was made, as plain totals on
 * Tropos's own server. They replace Google Analytics for the start of the
 * funnel, which hears nothing before the person has met its line on the
 * health-details agreement (src/lib/analyticsProvider.ts).
 *
 * WHAT IS STORED
 *
 *   setupCounts/{YYYY-MM-DD}   { welcome_viewed, setup_started,
 *                                account_created, updatedAt, expiresAt }
 *
 * One document a day (the server's UTC day), each step a number. Nothing
 * else: no uid, no device id, no address, no time finer than the day. The
 * request that adds one carries only the step's name (`readStep`); the app
 * sends it with no credentials and reads nothing stored to send it
 * (src/lib/setupCounts.ts), so it is not storage or access under PECR.
 * `account_created` is added by onAuthUserCreated, not by the app.
 *
 * Written only here, with the Admin SDK; firestore.rules refuse every
 * client read and write. A day is deleted by the TTL policy on
 * `setupCounts.expiresAt` (firestore.indexes.json) about 13 months after
 * it starts, so a year can be set beside the one before it.
 *
 * ABUSE. Anyone may send a step: the welcome is before any account, and
 * App Check is not enforced on any function yet (docs/app-check-rollout.md).
 * What bounds a flood without asking who sent it is the instance: each one
 * takes at most PER_MINUTE steps a minute and PER_DAY a day, counted in its
 * own memory (`stepAllowance`), and the function runs on at most ten
 * instances. A step past an instance's allowance is answered 204 like any
 * other and counted by nobody, so a flood learns nothing from the reply.
 */

const COLLECTION = "setupCounts";
/** The steps the app may send. `account_created` is the server's own. */
const CLIENT_STEPS = Object.freeze(["welcome_viewed", "setup_started"]);
const STEPS = Object.freeze([...CLIENT_STEPS, "account_created"]);
const DAY_MS = 86400000;
/** About 13 months: a day is kept until a year later can be read beside it. */
const KEEP_DAYS = 400;
/** One instance's allowance. Ten instances bound the whole at ten times. */
const PER_MINUTE = 60;
const PER_DAY = 5000;

/** The UTC day a count goes to, as YYYY-MM-DD. */
function dayKey(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function setupCountsExpiresAt(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + KEEP_DAYS * DAY_MS);
}

/** The step a request names, or null. The body is `{ step }` and nothing
 *  else is read from it. */
function readStep(body) {
  let value = body;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const step = value.step;
  return CLIENT_STEPS.includes(step) ? step : null;
}

/**
 * One instance's allowance, in its own memory: a minute's window and a
 * day's. Returns a function that answers whether one more step may count
 * at `nowMs`.
 */
function stepAllowance({ perMinute = PER_MINUTE, perDay = PER_DAY } = {}) {
  let minute = -1;
  let inMinute = 0;
  let day = "";
  let inDay = 0;
  return (nowMs) => {
    const thisMinute = Math.floor(nowMs / 60000);
    if (thisMinute !== minute) {
      minute = thisMinute;
      inMinute = 0;
    }
    const today = dayKey(nowMs);
    if (today !== day) {
      day = today;
      inDay = 0;
    }
    if (inMinute >= perMinute || inDay >= perDay) return false;
    inMinute += 1;
    inDay += 1;
    return true;
  };
}

/** Add one to a step's count for the day `nowMs` falls in. Only ever an
 *  increment, never a read: every step in Tropos writes the day's one
 *  document. */
async function addSetupCount({ db, FieldValue, step, nowMs }) {
  if (!STEPS.includes(step)) throw new Error(`Unknown setup step: ${step}`);
  const key = dayKey(nowMs);
  await db
    .collection(COLLECTION)
    .doc(key)
    .set(
      {
        [step]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: setupCountsExpiresAt(key),
      },
      { merge: true }
    );
}

/**
 * The HTTPS handler's body, after CORS. Answers 204 whether or not the
 * step counted, 400 for a body that names no step, 405 for anything but a
 * POST. Logs nothing about the request.
 */
async function serveSetupCount(req, res, { db, FieldValue, allow, now }) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const step = readStep(req.body);
  if (!step) {
    res.status(400).end();
    return;
  }
  const nowMs = now();
  if (allow(nowMs)) await addSetupCount({ db, FieldValue, step, nowMs });
  res.status(204).end();
}

module.exports = {
  COLLECTION,
  CLIENT_STEPS,
  STEPS,
  KEEP_DAYS,
  PER_MINUTE,
  PER_DAY,
  dayKey,
  setupCountsExpiresAt,
  readStep,
  stepAllowance,
  addSetupCount,
  serveSetupCount,
};

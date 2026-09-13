"use strict";

const crypto = require("crypto");
const rateLimiter = require("../rateLimiter");

/**
 * Free-week cap per network address — Sub1a pin 1's mitigation, built.
 *
 * The onboarding free week (`trialExpiresAt`) is granted per account and
 * needs no card, so a fresh email is a fresh week. The lock accepted that
 * leak for a small user base on the condition that account creation was
 * rate-limited by IP; the limit was never built. This is it, scoped to
 * the thing that costs money: after `TRIAL_IP_CAP` free weeks have been
 * granted from one address inside `TRIAL_IP_WINDOW_MS`, further accounts
 * from it still onboard — as free. Nothing is refused; only the perk.
 *
 * Rides the shared limiter (`rateLimits/{key}_{action}`, a transaction
 * over a pruned timestamp window) so the accounting is the one the AI
 * quotas already trust. The key is a hash of the address, never the
 * address: the doc holds `ip_<hash>` and timestamps, no user id, and it
 * is not in the account-deletion sweep (the sweep's range filter matches
 * `{uid}_` prefixes; this one starts with `ip_`).
 *
 * Fail-closed, like the limiter it rides: a transaction error counts as
 * capped. A user who loses the free week to a Firestore blip still has
 * the app and the card trial on the offer page; a farm that gets a free
 * week from a Firestore blip is the failure the cap exists to stop.
 * No address at all (a request with no forwarding header and no socket
 * address — the emulator, some test harnesses) is NOT capped: there is
 * nothing to count, and the grant path must keep working there.
 */
const TRIAL_IP_CAP = 3;
const TRIAL_IP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TRIAL_IP_ACTION = "trialGrant";

/**
 * The caller's address as the platform saw it: first hop of
 * `x-forwarded-for` (Cloud Functions sits behind a proxy, so the socket
 * address is the proxy's), else the request's own `ip`, else nothing.
 * @param {import("express").Request | undefined} rawRequest
 * @returns {string | null}
 */
function callerIp(rawRequest) {
  const headers = (rawRequest && rawRequest.headers) || {};
  const xff = headers["x-forwarded-for"];
  const first = (
    Array.isArray(xff) ? xff[0] : typeof xff === "string" ? xff : ""
  )
    .split(",")[0]
    .trim();
  if (first) return first;
  const own =
    rawRequest && typeof rawRequest.ip === "string" ? rawRequest.ip.trim() : "";
  return own || null;
}

/**
 * Limiter key for an address: a truncated SHA-256, so the stored doc id
 * carries no address and two requests from one address share one key.
 * @param {string} ip
 */
function ipKey(ip) {
  return `ip_${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

/**
 * Whether this grant should be withheld. Counts the attempt: call it only
 * on the path that is about to grant, so the window holds grants and
 * nothing else.
 * @param {{ db: FirebaseFirestore.Firestore, rawRequest: unknown, limiter?: { isRateLimited: Function } }} args
 * @returns {Promise<{ capped: boolean, key: string | null }>}
 */
async function isTrialGrantCapped({ db, rawRequest, limiter = rateLimiter }) {
  const ip = callerIp(rawRequest);
  if (!ip) return { capped: false, key: null };
  const key = ipKey(ip);
  const capped = await limiter.isRateLimited(
    db,
    key,
    TRIAL_IP_ACTION,
    TRIAL_IP_CAP,
    TRIAL_IP_WINDOW_MS
  );
  return { capped, key };
}

module.exports = {
  TRIAL_IP_CAP,
  TRIAL_IP_WINDOW_MS,
  TRIAL_IP_ACTION,
  callerIp,
  ipKey,
  isTrialGrantCapped,
};

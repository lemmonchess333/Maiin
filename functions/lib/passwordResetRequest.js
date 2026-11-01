"use strict";

/**
 * One forgot-password request, from what the caller sent to what to reply.
 * sendPasswordResetLinkCallable is a thin wrapper round this; the Admin
 * SDK, Firestore, Resend and the logger come in as arguments so the whole
 * decision is testable without them.
 *
 * Anyone can call it: the person is signed out. So once an address is
 * accepted, the reply is { ok: true } whatever happens next: no account, a
 * link sent, a link that could not be made (a disabled account) or an
 * email Resend would not take. Any other reply would tell a stranger which
 * addresses have accounts, so a failure is logged instead, at error level,
 * where an outage still shows. Only a malformed address or too many
 * requests for one address is refused, and neither depends on an account.
 * Reaching the project-wide daily cap on sends replies { ok: true } too:
 * it is reached only by sending, so refusing would say there was a link
 * to send.
 *
 * The time taken still differs: an address with an account waits while
 * the email is handed to Resend, and one without does not. Closing that
 * needs the send moved off the request (a queue and a worker), which is
 * not worth its moving parts while each address is rate-limited and the
 * difference is one HTTPS round trip.
 */

const {
  DAY_MS,
  PASSWORD_RESET_LIMITS,
  firstEmailLimitHit,
  isEmailRateLimited,
  passwordResetKey,
} = require("./emailRateLimit");
const {
  readResetEmail,
  sendPasswordResetEmail,
} = require("./passwordResetEmail");

/**
 * Reset emails sent across every address in a rolling day. The
 * per-address windows stop one inbox being flooded; this stops requests
 * spread over many real addresses from spending the Resend allowance and
 * the sending domain's reputation, which the verification, trial and
 * report emails share. 500 is far more than forgotten passwords need at
 * Tropos's size, and it puts a known number on what abuse can send in a
 * day. Only sends are counted (see mayDeliver): an address with no
 * account mints no link, so made-up addresses cannot use it up. One
 * record holds the count, written once per send, which at this rate is
 * no contention.
 */
const PASSWORD_RESET_SENDS_PER_DAY = 500;
const PASSWORD_RESET_SEND_CAP = Object.freeze({
  key: "pwreset_all",
  action: "passwordResetSend",
  maxCalls: PASSWORD_RESET_SENDS_PER_DAY,
  windowMs: DAY_MS,
});

/** An error message with any email address in it cut out, for the logs. */
function withoutAddresses(message) {
  return String(message || "")
    .slice(0, 300)
    .replace(/\S+@\S+/g, "[address]");
}

/**
 * @param {object} args
 * @param {unknown} args.data - what the caller sent
 * @param {FirebaseFirestore.Firestore} args.firestore - for the rate limit
 * @param {(email: string) => Promise<string>} args.generateLink
 * @param {(msg: object) => Promise<void>} args.sendEmail
 * @param {{ info: Function, warn: Function, error: Function }} args.logger
 * @param {object} [args.limiter] - the shared rate limiter, for tests
 * @returns {Promise<{ ok: true } | { refused: { code: string, message: string } }>}
 */
async function requestPasswordReset({
  data,
  firestore,
  generateLink,
  sendEmail,
  logger,
  limiter,
}) {
  // Length first, then a pattern that cannot backtrack: see readResetEmail.
  const email = readResetEmail(data);
  if (!email) {
    return {
      refused: {
        code: "invalid-argument",
        message: "A valid email is required.",
      },
    };
  }
  // Keyed on a hash of the address (no auth uid — logged out): a few
  // minutes' burst and a day's total per address, for any address, with
  // an account or without.
  const hit = await firstEmailLimitHit({
    firestore,
    key: passwordResetKey(email),
    limits: PASSWORD_RESET_LIMITS,
    limiter,
  });
  if (hit) {
    return { refused: { code: "resource-exhausted", message: hit.message } };
  }
  try {
    const result = await sendPasswordResetEmail({
      generateLink,
      sendEmail,
      email,
      mayDeliver: async () =>
        !(await isEmailRateLimited({
          firestore,
          ...PASSWORD_RESET_SEND_CAP,
          limiter,
        })),
    });
    if (result.reason === "daily-cap") {
      logger.warn("sendPasswordResetLinkCallable.dailyCap", {
        cap: PASSWORD_RESET_SENDS_PER_DAY,
      });
    } else {
      logger.info("sendPasswordResetLinkCallable", {
        sent: result.sent,
        reason: result.reason,
      });
    }
  } catch (err) {
    logger.error("sendPasswordResetLinkCallable.error", {
      error: withoutAddresses(err && err.message),
    });
  }
  return { ok: true };
}

module.exports = {
  requestPasswordReset,
  PASSWORD_RESET_SENDS_PER_DAY,
  PASSWORD_RESET_SEND_CAP,
};

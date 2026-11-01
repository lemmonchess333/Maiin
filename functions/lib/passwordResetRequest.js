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
 *
 * The time taken still differs: an address with an account waits while
 * the email is handed to Resend, and one without does not. Closing that
 * needs the send moved off the request (a queue and a worker), which is
 * not worth its moving parts while each address is rate-limited and the
 * difference is one HTTPS round trip.
 */

const { isEmailRateLimited, passwordResetKey } = require("./emailRateLimit");
const {
  readResetEmail,
  sendPasswordResetEmail,
} = require("./passwordResetEmail");

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
 * @param {{ info: Function, error: Function }} args.logger
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
  // Keyed on a hash of the address (no auth uid — logged out). 5 per
  // 5 min per address caps bombing a single victim.
  const limited = await isEmailRateLimited({
    firestore,
    key: passwordResetKey(email),
    action: "passwordReset",
    maxCalls: 5,
    windowMs: 300_000,
    limiter,
  });
  if (limited) {
    return {
      refused: {
        code: "resource-exhausted",
        message: "Too many reset requests. Try again in a few minutes.",
      },
    };
  }
  try {
    const result = await sendPasswordResetEmail({
      generateLink,
      sendEmail,
      email,
    });
    logger.info("sendPasswordResetLinkCallable", {
      sent: result.sent,
      reason: result.reason,
    });
  } catch (err) {
    logger.error("sendPasswordResetLinkCallable.error", {
      error: withoutAddresses(err && err.message),
    });
  }
  return { ok: true };
}

module.exports = { requestPasswordReset };

"use strict";

/**
 * An email to the owner when an account deletion keeps failing.
 *
 * A deletion that failed was retried by the five-minute resume job a
 * minute later, every time, for as long as it kept failing, and nobody was
 * told: the account stayed frozen half-deleted while the person had been
 * promised it was going. The executor now backs off (`nextRetryAt` in
 * accountDeletionLedger.js) and resumeDeletions sends this once, when a
 * request has failed `STUCK_AFTER_ATTEMPTS` times.
 *
 * It names the request by its support code (DL-XXXXXX, the code the person
 * sees and can quote), never by uid or address, and says where it failed.
 * The rest stays in accountDeletionRequests. Never throws: a failed alert
 * must not stop the retries.
 */

const { alertRecipient } = require("./reportAlert");

const STUCK_AFTER_ATTEMPTS = 6;
const DEFAULT_TIMEOUT_MS = 8000;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildStuckDeletionEmail({
  supportCode,
  attemptCount,
  failedStage,
  lastErrorCode,
}) {
  const code = supportCode || "unknown";
  const lines = [
    `The deletion with support code ${code} has failed ${attemptCount} times.`,
    `It last stopped at "${failedStage || "unknown"}" with "${lastErrorCode || "unknown"}".`,
    "The account stays frozen while it is retried, now every few hours.",
    "Find it in Firestore under accountDeletionRequests, status failed_cleanup, by its support code.",
  ];
  return {
    subject: `An account deletion is stuck (${code})`,
    text: lines.join("\n"),
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1b22;">${lines
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("")}</body></html>`,
  };
}

/** Email the alert for one stuck request. Never throws. */
async function sendStuckDeletionAlert({
  sendEmail,
  request,
  to = alertRecipient(),
  logger = console,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let timer;
  try {
    const email = buildStuckDeletionEmail(request);
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer after ${timeoutMs} ms`)),
        timeoutMs
      );
    });
    await Promise.race([sendEmail({ to, ...email }), timedOut]);
    return { sent: true };
  } catch (err) {
    logger.warn("deleteAccount.stuck_alert_failed", {
      supportCode: request && request.supportCode,
      error: err && err.message,
    });
    return { sent: false };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  STUCK_AFTER_ATTEMPTS,
  buildStuckDeletionEmail,
  sendStuckDeletionAlert,
};

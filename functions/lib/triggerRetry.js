"use strict";

/**
 * Retried Firestore triggers.
 *
 * A trigger with `failurePolicy: true` is delivered again when it throws,
 * with backoff, for up to seven days. The session and social triggers each
 * caught and logged their failures, so none of them ever threw: a
 * contended transaction or a timeout lost that session's partner streak,
 * badge, lifetime total or challenge credit, or that post's feed copies,
 * for good. A trigger that throws on a bug, though, would be delivered
 * again for a week.
 *
 * - `RETRY_WINDOW_MS` is how long an event keeps being retried. A day
 *   covers an outage, and a bad deploy put right the same day; past it the
 *   event is logged and dropped rather than retried until the platform
 *   gives up.
 * - `triggerSteps` runs each side effect whatever happens to the others,
 *   then throws once if any failed. Every step must be idempotent: a retry
 *   runs them all again, and the ones that landed find their markers.
 */

const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether this delivery is a retry of an event older than the window.
 *  `context.timestamp` is the source write's commit time. */
function pastRetryWindow(context, now = Date.now()) {
  const at = Date.parse((context && context.timestamp) || "");
  return Number.isFinite(at) && now - at > RETRY_WINDOW_MS;
}

function triggerSteps(label, log = console.error) {
  const failed = [];
  return {
    async run(name, step) {
      try {
        await step();
      } catch (err) {
        failed.push(name);
        log(`${label}: ${name} failed`, { message: err && err.message });
      }
    },
    /** Throws when a step failed, so the event is delivered again. */
    settle() {
      if (failed.length > 0) {
        throw new Error(
          `${label}: ${failed.join(", ")} failed; the event will be retried`
        );
      }
    },
  };
}

module.exports = { RETRY_WINDOW_MS, pastRetryWindow, triggerSteps };

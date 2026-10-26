"use strict";

/* ─────────────────────────────────────────────
   What the props, like and reaction callables tell the person when the
   toggle fails.

   They passed the engine's own message out with failed-precondition, which
   the app prints as prose (callableErrors.ts): Firestore's "10 ABORTED:
   Too much contention…", or an engine's diagnostic. As commentRejection.js
   does for comments, only a sentence written for the person goes out, and
   anything else is a generic `internal` whose detail stays in the log the
   callable writes.
   ───────────────────────────────────────────── */

/** The deletion transaction guard's refusal, already a sentence. */
const DELETION_IN_PROGRESS = "Account deletion is in progress.";

/** Engine failures the person can act on, each with the words they see. */
const KNOWN = [
  {
    test: /^comment-not-found$/,
    code: "failed-precondition",
    message: "This comment has been deleted.",
  },
];

/**
 * The HttpsError a toggle callable throws for `err`.
 *
 * @param {unknown} err what the engine threw
 * @param {object} opts
 * @param {object} opts.functions firebase-functions (v1), for HttpsError
 * @param {boolean} [opts.isAccessError] the target cannot be seen any more
 * @param {string} opts.accessMessage what to say when it cannot
 * @param {string} opts.fallback what to say for anything else
 */
function engagementRejection(
  err,
  { functions, isAccessError, accessMessage, fallback }
) {
  const { HttpsError } = functions.https;
  if (err instanceof HttpsError) return err;
  if (isAccessError) return new HttpsError("permission-denied", accessMessage);
  const message =
    (err && typeof err.message === "string" && err.message) || "";
  if (
    err &&
    err.code === "failed-precondition" &&
    message === DELETION_IN_PROGRESS
  ) {
    return new HttpsError("failed-precondition", DELETION_IN_PROGRESS);
  }
  const known = KNOWN.find((k) => k.test.test(message));
  if (known) return new HttpsError(known.code, known.message);
  return new HttpsError("internal", fallback);
}

module.exports = { engagementRejection };

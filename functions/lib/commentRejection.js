/* ─────────────────────────────────────────────
   What a comment callable tells the person when the write fails.

   The app shows a failed-precondition message as prose ("Couldn't post
   comment. <message>"), so only a sentence written for the person may go
   out with that code. The engines throw plain Errors whose messages are
   diagnostics ("deleteComment: comment abc123 not found"); those become a
   sentence here, or a generic `internal` whose detail stays in the log the
   callable already writes.
   ───────────────────────────────────────────── */

const { RESTRICTED_MESSAGE, RESTRICTED_REASON } = require("./restriction");

/** Engine failures the person can act on, each with the words they see. */
const KNOWN = [
  {
    test: /comment \S+ not found$/,
    code: "failed-precondition",
    message: "This comment has already been deleted.",
  },
  {
    test: /: not authorized$/,
    code: "failed-precondition",
    message: "You can only delete your own comments.",
  },
  {
    test: /: text must be 1-1000 chars$/,
    code: "failed-precondition",
    message: "Write a comment of up to 1,000 characters.",
  },
];

/** The deletion transaction guard's refusal, already a sentence. */
const DELETION_IN_PROGRESS = "Account deletion is in progress.";

/**
 * The HttpsError a comment callable throws for `err`.
 *
 * @param {unknown} err what the engine threw
 * @param {object} opts
 * @param {object} opts.functions firebase-functions (v1), for HttpsError
 * @param {boolean} [opts.isAccessError] the parent cannot be seen any more
 * @param {string} [opts.accessMessage] what to say when it cannot
 */
function commentRejection(err, { functions, isAccessError, accessMessage }) {
  const { HttpsError } = functions.https;
  if (err instanceof HttpsError) return err;
  if (isAccessError) return new HttpsError("failed-precondition", accessMessage);
  if (err && err.code === RESTRICTED_REASON) {
    return new HttpsError("permission-denied", RESTRICTED_MESSAGE, {
      reason: RESTRICTED_REASON,
    });
  }
  const message =
    (err && typeof err.message === "string" && err.message) || "";
  if (err && err.code === "failed-precondition" && message === DELETION_IN_PROGRESS) {
    return new HttpsError("failed-precondition", DELETION_IN_PROGRESS);
  }
  const known = KNOWN.find((k) => k.test.test(message));
  if (known) return new HttpsError(known.code, known.message);
  return new HttpsError("internal", "Something went wrong.");
}

module.exports = { commentRejection };

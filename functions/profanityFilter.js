/**
 * Server-side profanity filter for UGC writes.
 *
 * The definitive moderation gate — the client also runs the
 * filter for UX feedback, but a fetch from curl bypasses it
 * entirely so the server has to be the trust boundary.
 *
 * Mirrors src/lib/profanityFilter.ts exactly: same library, same
 * predicate semantics. Pulled out as a pure module so the Cloud
 * Function trigger can import it without booting firebase-admin
 * in unit tests.
 *
 * Used by the onActivityCreated trigger in index.js: any activity
 * whose `caption`, `workoutName`, or `runName` contains a blocked
 * word gets auto-flagged and forced to private visibility. The
 * activity isn't deleted — the author still sees their own
 * record. The flag flows into the moderation queue for human
 * review.
 *
 * Why leo-profanity: bad-words@4 has a broken CJS export
 * (requires non-existent ./badwords.js); leo-profanity ships
 * clean CJS, ~250 words, no aggressive false-positives on
 * legitimate fitness vocabulary.
 */

const leoProfanity = require("leo-profanity");

/**
 * Predicate: does `text` contain any blocked word?
 * Whitespace-only / empty / non-string inputs short-circuit to
 * false — the caller validates non-emptiness elsewhere if needed.
 */
function containsProfanity(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  return leoProfanity.check(text);
}

/**
 * Scans every value of `record` whose key is in `textFields` and
 * returns the first field-name whose value contains profanity,
 * or null if none do. Used by the activity trigger to flag the
 * specific offending field for the moderation queue.
 */
function findProfaneField(record, textFields) {
  if (!record || typeof record !== "object") return null;
  if (!Array.isArray(textFields)) return null;
  for (const field of textFields) {
    if (containsProfanity(record[field])) return field;
  }
  return null;
}

/**
 * Returns a cleaned copy of `text` with blocked words replaced
 * by asterisks. Not used in the auto-flag path (we preserve the
 * original for the moderation reviewer) but exposed for future
 * "clean and accept" flows.
 */
function cleanProfanity(text) {
  if (typeof text !== "string") return "";
  return leoProfanity.clean(text);
}

module.exports = {
  containsProfanity,
  findProfaneField,
  cleanProfanity,
};

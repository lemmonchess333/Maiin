"use strict";

/**
 * One word filter for every piece of public text (App Review Guideline 1.2).
 *
 * The filter itself is `profanityFilter.js` (leo-profanity, mirrored on the
 * client by src/lib/profanityFilter.ts). This module holds the decisions the
 * callables make with it, and the sentences a refused person reads, so that
 * every writer of public text refuses the same way:
 *
 *   - activity and space-post comments: addCommentCallable and
 *     addSpacePostCommentCallable refuse before writing. (onCommentCreated
 *     still deletes an activity comment that got past an older client.)
 *   - display names: completeOnboarding and configurePlan refuse a profile
 *     whose displayName trips the filter. The Settings name field writes the
 *     profile directly, so it checks on the client (src/lib/displayName.ts).
 *   - space posts: onSpacePostWritten removes one (lib/spacePostModeration.js).
 *   - activities: onActivityCreated makes one private.
 *
 * The refusals travel as `failed-precondition`, the one code whose message
 * the client shows (src/lib/callableErrors.ts describeRejection). The client
 * says the same sentences when it catches the text first; the two copies are
 * pinned equal by src/lib/__tests__/profanityFilterMirror.cross.test.ts.
 */

const profanityFilter = require("../profanityFilter");

const REFUSALS = Object.freeze({
  comment:
    "This comment contains objectionable language. Reword it and try again.",
  displayName:
    "This name contains objectionable language. Choose a different one.",
  authorName:
    "Your display name contains objectionable language. Change it in Settings, then try again.",
});

/**
 * The refusal for a comment, or null when it may be posted. The text is
 * checked first: it is what the person just typed. The name rides along on
 * every comment (the callables take it from the client), so a name that
 * trips the filter is refused too, with a sentence that says which part.
 */
function commentRefusal({ text, authorName }) {
  if (profanityFilter.containsProfanity(text)) return REFUSALS.comment;
  if (profanityFilter.containsProfanity(authorName)) return REFUSALS.authorName;
  return null;
}

/** The refusal for a display name, or null when it may be saved. */
function displayNameRefusal(name) {
  return profanityFilter.containsProfanity(name) ? REFUSALS.displayName : null;
}

module.exports = { REFUSALS, commentRefusal, displayNameRefusal };

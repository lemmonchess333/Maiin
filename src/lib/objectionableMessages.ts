/**
 * What a person reads when public text they wrote is refused. The server
 * refuses with the same sentences (REFUSALS in
 * functions/lib/objectionableText.js), so a comment or a name reads the same
 * whether the app caught it first or the server did. Pinned equal by
 * profanityFilterMirror.cross.test.ts.
 *
 * Kept apart from the word lists (`profanityFilter.ts`) so a composer can
 * say the sentence without loading them: the lists load through
 * `wordFilter.ts` when text is first checked.
 */
export const OBJECTIONABLE_COMMENT_MESSAGE =
  "This comment contains objectionable language. Reword it and try again.";
export const OBJECTIONABLE_NAME_MESSAGE =
  "This name contains objectionable language. Choose a different one.";
/** A space post. Only the app says it: the server takes such a post down
 *  rather than refusing it (functions/lib/spacePostModeration.js). */
export const OBJECTIONABLE_POST_MESSAGE =
  "This post contains objectionable language. Reword it and try again.";

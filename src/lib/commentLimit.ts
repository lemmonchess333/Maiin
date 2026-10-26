/**
 * The longest comment the comment box takes, in the units an input's
 * maxLength counts (UTF-16 code units).
 *
 * Both comment callables refuse a longer one: MAX_COMMENT_LENGTH in
 * functions/lib/commentLimit.js, which commentLimit.cross.test.ts holds
 * equal to this. A box that let more through would end in a refusal the
 * person could not have seen coming; one that stopped short would cut a
 * comment the server takes.
 */
export const COMMENT_MAX_CHARS = 1000;

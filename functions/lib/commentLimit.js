"use strict";

/**
 * The longest comment either comment callable accepts, after trimming, in
 * the units String.length counts (UTF-16 code units, the unit an input's
 * maxLength counts in). Activity comments (socialCounters.addComment) and
 * Space post comments (spacePostEngagement.addSpacePostComment) share it.
 *
 * The comment box stops at the app's COMMENT_MAX_CHARS
 * (src/lib/commentLimit.ts). commentLimit.cross.test.ts holds the two
 * equal: a box that let more through than this would end in a refusal the
 * person could not have seen coming.
 */
const MAX_COMMENT_LENGTH = 1000;

module.exports = { MAX_COMMENT_LENGTH };

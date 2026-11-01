"use strict";

/**
 * Server-side word filter for Community Space posts (App Review 1.2).
 *
 * Space posts are written by the client straight to Firestore
 * (SpacePostComposer → spaces/{spaceId}/posts), and the composer's own
 * profanity check is only a courtesy: a direct SDK write skips it. This is
 * the activity pattern (onActivityCreated) applied to posts: a trigger runs
 * the same filter over the post's text and takes a post that trips it out
 * of the space.
 *
 * "Out of the space" means deleted, where an activity is made private.
 * Activities have a visibility the rules enforce; space posts do not — any
 * signed-in user may read any post, and rules cannot filter a list query —
 * so a flag on the post would hide nothing. Nothing is kept: the composer
 * refuses the same text before it is sent, so only a write that went
 * around the app lands here, and the log line records which post, whose,
 * and which field.
 *
 * The trigger fires on every write, not only creates: an author may edit a
 * post's title and body (firestore.rules), and an edit is as public as the
 * original. Writes that leave the text alone (the server-owned like and
 * comment counters) are skipped without a read.
 *
 * A new post past SPACE_POST_MAX_BYTES is removed the same way. The rules
 * bound the post's own fields but not the points inside its attached
 * route, so a post near Firestore's 1 MiB limit can still be written, and
 * everyone who opens the Space downloads it. The largest post the composer
 * writes is a few kilobytes.
 *
 * At-least-once safe: the decision is re-made inside a transaction against
 * the post as it is NOW, so a retried event, or an author who already
 * reworded the post, deletes nothing. The likes and comments under a
 * removed post go after the commit, as the account-deletion sweep does
 * (lib/spacesCleanup.js uses recursiveDelete for the same reason).
 */

const profanityFilter = require("../profanityFilter");
const { storedSize } = require("./storedSize");

/** The public text on a space post, in the order a reviewer reads it. */
const SPACE_POST_TEXT_FIELDS = Object.freeze(["title", "body", "authorName"]);

/** The most a post may weigh and stay in its Space: a 4,000-character
 *  body, a title, a photo URL and a hundred route points come to well
 *  under a third of it. */
const SPACE_POST_MAX_BYTES = 64 * 1024;

/** What a removal names for a post past that size. */
const OVERSIZED = "size";

/** Why a post comes out: "size", the field the filter refuses, or null. */
function removalField(data) {
  if (storedSize(data) > SPACE_POST_MAX_BYTES) return OVERSIZED;
  return profanityFilter.findProfaneField(data, SPACE_POST_TEXT_FIELDS);
}

function textChanged(before, after) {
  if (!before) return true;
  return SPACE_POST_TEXT_FIELDS.some((field) => before[field] !== after[field]);
}

/**
 * Remove the post at `ref` if this write gave it text that trips the
 * filter, or if it is a new post past SPACE_POST_MAX_BYTES. `before` /
 * `after` are the event's document data (null when the document did not
 * exist on that side of the write).
 *
 * @returns {Promise<{removed: boolean, field?: string}>}
 */
async function removeObjectionableSpacePost({
  firestore,
  ref,
  before,
  after,
  logger = console,
}) {
  if (!after) return { removed: false }; // a delete
  if (!textChanged(before, after)) return { removed: false };
  if (!removalField(after)) return { removed: false };

  const field = await firestore.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return null;
    const found = removalField(current.data() || {});
    if (found) tx.delete(ref);
    return found;
  });
  if (!field) return { removed: false };

  logger.warn("onSpacePostWritten.auto_remove", {
    path: ref.path,
    authorId: after.authorId || null,
    field,
  });
  try {
    // Likes and comments live in subcollections a document delete leaves
    // behind.
    await firestore.recursiveDelete(ref);
  } catch (err) {
    logger.warn("onSpacePostWritten.subcollection_cleanup_failed", {
      path: ref.path,
      error: err && err.message,
    });
  }
  return { removed: true, field };
}

module.exports = {
  SPACE_POST_MAX_BYTES,
  SPACE_POST_TEXT_FIELDS,
  removeObjectionableSpacePost,
};

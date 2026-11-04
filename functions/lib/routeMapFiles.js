"use strict";

/**
 * A run post's map images go with the post (Soc15 call 5).
 *
 * The author's app draws a run post's map once the post exists and
 * uploads it to `route-maps/{authorId}/{activityId}/{light|dark}.jpg`
 * (src/lib/routeMapUpload.ts); storage.rules lets it write there only
 * beside a post of its own that exists. Deleting the post (the finish
 * screen's Undo, deleting the session, the author's own delete, the
 * account-deletion executor) removed only the document, so
 * onActivityDeleted deletes the post's folder too.
 *
 * The folder is found from the post, not from the URLs it names: the
 * upload can land and the post never name it (the app gave up between
 * the two), and those files go as well. Only a post that shared a route
 * can have a map, so a lift's post, or a run's with its route withheld,
 * never needs Storage.
 */

const PREFIX = "route-maps";

/** Whether a post could have a map: it names one, or shares a route. */
function couldHaveRouteMap(data) {
  if (!data || typeof data !== "object") return false;
  if (data.routeMap && typeof data.routeMap === "object") return true;
  return Array.isArray(data.routePreview) && data.routePreview.length > 1;
}

/** One path segment as Storage names it: not empty, no slash, not a dot
 *  name. A blank author would make the prefix every author's folder. */
function isSegment(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".."
  );
}

/** The folder a post's map images live in, or null when the post's
 *  author or id cannot name one safely. Always ends in a slash, so one
 *  post's folder never matches another whose id it begins. */
function routeMapPrefix(authorId, activityId) {
  if (!isSegment(authorId) || !isSegment(activityId)) return null;
  return `${PREFIX}/${authorId}/${activityId}/`;
}

/**
 * Delete a deleted post's map images, if it could have any. `getBucket` is
 * called only then. Files already gone (never made, or deleted by an
 * earlier delivery or by the account sweep) are not an error; any other
 * failure throws, so the retried trigger tries again.
 * @returns {Promise<string|null>} the folder emptied, or null
 */
async function deleteRouteMapFiles({ data, activityId, getBucket, logger }) {
  if (!couldHaveRouteMap(data)) return null;
  const prefix = routeMapPrefix(data.authorId, activityId);
  if (!prefix) {
    if (logger) logger.warn("routeMapFiles.noFolder", { activityId });
    return null;
  }
  await getBucket().deleteFiles({ prefix });
  return prefix;
}

module.exports = { couldHaveRouteMap, routeMapPrefix, deleteRouteMapFiles };

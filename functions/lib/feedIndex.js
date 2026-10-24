"use strict";

const FEED_INDEX_VERSION = 2;
const FEED_COPY_RETENTION_DAYS = 180;
const FEED_COPY_PATH = /^feeds\/[^/]+\/items\/[^/]+$/;

/** Feed rows are routing indexes, never a second copy of private content.
 * authorId is retained for account-deletion cleanup and badge suppression.
 * Names, photos, session details and highlights are read from the parent
 * activity, whose rules enforce its CURRENT visibility and block relation. */
function buildFeedIndex({ activityId, authorId, createdAt, expiresAt }) {
  return {
    schemaVersion: FEED_INDEX_VERSION,
    activityId,
    authorId,
    createdAt,
    expiresAt,
  };
}

module.exports = {
  FEED_INDEX_VERSION,
  FEED_COPY_RETENTION_DAYS,
  FEED_COPY_PATH,
  buildFeedIndex,
};

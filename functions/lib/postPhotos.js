"use strict";

/**
 * A shared session's photos on the server (Soc15 call 2).
 *
 * The author's app adds one to four photos to a post once the post exists
 * (src/lib/postPhotoUpload.ts): each is uploaded to
 * `post-photos/{authorId}/{activityId}/{photoId}.jpg`, screened, and only
 * then named on the post's `photos` list. storage.rules lets it write there
 * only beside a post of its own that exists.
 *
 * Two things here:
 *   - The folder goes with the post. onActivityDeleted empties it whatever
 *     the post names: an upload can land and never be named (the app gave
 *     up between the two, or a photo was taken off and its file was left),
 *     and those files go as well. Any post can carry photos, so every
 *     deleted post's folder is emptied; an empty one deletes nothing.
 *   - What the moderation queue shows of a reported post: the URLs on its
 *     list that are this post's own uploads, as firestore.rules'
 *     `isPostPhotoUrl` takes them, and nothing else.
 *
 * The folder's segments are held to the same rule as a run post's map
 * folder (`isSegment`, lib/routeMapFiles.js): a blank or slashed author
 * would make the prefix someone else's folder, or every author's.
 */

const { isSegment } = require("./routeMapFiles");

const PREFIX = "post-photos";

/** The most photos a post carries; firestore.rules checks the same four. */
const MAX_POST_PHOTOS = 4;

/** A photo's id as the app makes one and the rules take it. */
const PHOTO_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The project's bucket, under either name it answers to. */
const BUCKET_URL =
  /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/adaptive-fitness-af8bb\.(firebasestorage\.app|appspot\.com)\/o\//;

/** The folder a post's photos live in, or null when the post's author or
 *  id cannot name one safely. Always ends in a slash, so one post's folder
 *  never matches another whose id it begins. */
function postPhotoPrefix(authorId, activityId) {
  if (!isSegment(authorId) || !isSegment(activityId)) return null;
  return `${PREFIX}/${authorId}/${activityId}/`;
}

/**
 * Empty a deleted post's photo folder. `getBucket` is called only when the
 * folder can be named. Files already gone (never uploaded, or deleted by an
 * earlier delivery or by the account sweep) are not an error; any other
 * failure throws, so the retried trigger tries again.
 * @returns {Promise<string|null>} the folder emptied, or null
 */
async function deletePostPhotoFiles({ data, activityId, getBucket, logger }) {
  const authorId = data && typeof data === "object" ? data.authorId : undefined;
  const prefix = postPhotoPrefix(authorId, activityId);
  if (!prefix) {
    if (logger) logger.warn("postPhotos.noFolder", { activityId });
    return null;
  }
  await getBucket().deleteFiles({ prefix });
  return prefix;
}

/** Whether `url` is the download URL of this post's own photo `id`. */
function isPostPhotoUrl(url, authorId, activityId, id) {
  if (typeof url !== "string" || url.length > 2048) return false;
  if (typeof id !== "string" || !PHOTO_ID.test(id)) return false;
  const bucket = BUCKET_URL.exec(url);
  if (!bucket) return false;
  const rest = url.slice(bucket[0].length);
  const name = `${PREFIX}%2F${authorId}%2F${activityId}%2F${id}.jpg`;
  if (!rest.startsWith(name)) return false;
  const tail = rest.slice(name.length);
  return tail === "" || tail[0] === "?" || tail[0] === "#";
}

/**
 * The photo URLs a reported post names that are its own uploads, in the
 * post's order, at most four. Anything else on the list is left out.
 * @returns {string[]}
 */
function postPhotoUrls(photos, authorId, activityId) {
  if (!Array.isArray(photos)) return [];
  if (!isSegment(authorId) || !isSegment(activityId)) return [];
  const urls = [];
  for (const photo of photos.slice(0, MAX_POST_PHOTOS)) {
    if (!photo || typeof photo !== "object") continue;
    if (isPostPhotoUrl(photo.url, authorId, activityId, photo.id)) {
      urls.push(photo.url);
    }
  }
  return urls;
}

module.exports = {
  MAX_POST_PHOTOS,
  postPhotoPrefix,
  deletePostPhotoFiles,
  isPostPhotoUrl,
  postPhotoUrls,
};

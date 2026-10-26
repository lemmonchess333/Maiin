"use strict";

/**
 * A Space post's photo goes with the post.
 *
 * A post names its photo by download URL (`photoUrl`, written by
 * src/lib/spacePhotoUpload.ts as `space-photos/{authorId}/{ts}.jpg`).
 * Deleting the post removed only the document, so the file stayed in
 * Storage for as long as the account did, and anyone signed in could
 * list the folder and fetch it (storage.rules now grants `get`, never
 * `list`). onSpacePostWritten deletes the file when its post is deleted
 * or no longer names it, by the author, a moderator or the account-
 * deletion executor alike.
 *
 * `photoUrl` is written by the client, and the rules accept any Firebase
 * Storage URL for it. So a file is deleted only when the URL names an
 * object in THIS project's bucket under the post author's OWN prefix: a
 * post that names someone else's photo, and is then deleted, must not
 * take that photo with it.
 */

const HOST = "firebasestorage.googleapis.com";
const PREFIX = "space-photos";

/**
 * The object path a download URL names, when it is a file the author owns
 * under `space-photos/{authorId}/` in `bucketName`; otherwise null.
 */
function ownedPhotoPath(photoUrl, authorId, bucketName) {
  if (typeof photoUrl !== "string" || !photoUrl) return null;
  if (typeof authorId !== "string" || !authorId) return null;
  if (typeof bucketName !== "string" || !bucketName) return null;
  let url;
  try {
    url = new URL(photoUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== HOST || url.port) {
    return null;
  }
  // `/v0/b/{bucket}/o/{object}`, with the object's slashes encoded.
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;
  let bucket;
  let path;
  try {
    bucket = decodeURIComponent(match[1]);
    path = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (bucket !== bucketName) return null;
  const segments = path.split("/");
  if (segments.length < 3) return null;
  if (segments[0] !== PREFIX || segments[1] !== authorId) return null;
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return path;
}

/**
 * The file a write leaves behind: the photo the post named before, when
 * the post is gone or names another one now. Null when there is none, or
 * when it is not the author's own (see the header).
 */
function orphanedPhotoUrl(before, after) {
  if (!before || typeof before.photoUrl !== "string" || !before.photoUrl) {
    return null;
  }
  if (after && after.photoUrl === before.photoUrl) return null;
  return before.photoUrl;
}

/**
 * Delete the photo a Space post write left behind, if any. `getBucket` is
 * called only when there is one, so a write without a photo never needs
 * Storage. A file already gone (refused by screening, swept by a deletion,
 * or deleted by an earlier delivery of this event) is not an error; any
 * other failure throws, so the retried trigger tries again.
 */
async function deleteOrphanedPhoto({ before, after, getBucket, logger }) {
  const photoUrl = orphanedPhotoUrl(before, after);
  if (!photoUrl) return null;
  const bucket = getBucket();
  const path = ownedPhotoPath(photoUrl, before.authorId, bucket.name);
  if (!path) {
    if (logger) {
      logger.warn("spacePostPhoto.notOwned", { authorId: before.authorId });
    }
    return null;
  }
  try {
    await bucket.file(path).delete();
  } catch (err) {
    if (err && (err.code === 404 || err.code === "404")) return path;
    throw err;
  }
  return path;
}

module.exports = { ownedPhotoPath, orphanedPhotoUrl, deleteOrphanedPhoto };

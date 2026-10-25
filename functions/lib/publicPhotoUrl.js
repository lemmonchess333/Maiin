"use strict";

// Keep public avatars within the same origin/length boundary as
// firestore.rules:isAllowedPhotoUrl. Admin SDK comment writes bypass Rules.
// publicPhotoUrl.test.js reads the rule and holds the two to one answer.
const STORAGE_ORIGIN = "https://firebasestorage.googleapis.com";
const PUBLIC_PHOTO_ORIGINS = new Set([
  STORAGE_ORIGIN,
  "https://lh3.googleusercontent.com",
  "https://appleid.cdn-apple.com",
]);
// This project's own buckets. Every Firebase project serves from the
// Storage origin, so the origin alone admits another project's bucket,
// whose access logs carry every viewer's IP.
const OWN_BUCKET_PATH =
  /^\/v0\/b\/adaptive-fitness-af8bb\.(firebasestorage\.app|appspot\.com)\/o\//;

function publicPhotoUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    // Reject credentials and noncanonical input, including whitespace and
    // backslashes; do not truncate a signed URL into a different resource.
    if (url.username || url.password || value !== url.href) return undefined;
    if (!PUBLIC_PHOTO_ORIGINS.has(url.origin)) return undefined;
    if (url.origin === STORAGE_ORIGIN && !OWN_BUCKET_PATH.test(url.pathname)) {
      return undefined;
    }
    return value;
  } catch (_) {
    return undefined;
  }
}

module.exports = { publicPhotoUrl };

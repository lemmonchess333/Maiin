"use strict";

// Keep public avatars within the same origin/length boundary as
// firestore.rules:isAllowedPhotoUrl. Admin SDK comment writes bypass Rules.
const PUBLIC_PHOTO_ORIGINS = new Set([
  "https://firebasestorage.googleapis.com",
  "https://lh3.googleusercontent.com",
  "https://appleid.cdn-apple.com",
]);

function publicPhotoUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    // Reject credentials and noncanonical input, including whitespace and
    // backslashes; do not truncate a signed URL into a different resource.
    if (url.username || url.password || value !== url.href) return undefined;
    return PUBLIC_PHOTO_ORIGINS.has(url.origin) ? value : undefined;
  } catch (_) {
    return undefined;
  }
}

module.exports = { publicPhotoUrl };

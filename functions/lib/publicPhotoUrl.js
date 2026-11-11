"use strict";

// Keep public avatars within the same boundary as
// firestore.rules:isAllowedPhotoUrl. Admin SDK writes bypass Rules.
// publicPhotoUrl.test.js reads the rule and holds the two to one answer.
//
// The three places a photo other people see may come from:
//   - this project's own buckets, and only the two folders the photo
//     screen checks (lib/photoScreen.js): profile photos and Space photos.
//     Every Firebase project serves from the Storage origin, so the origin
//     alone admits another project's bucket, whose access logs carry every
//     viewer's IP. The object name is one path segment (a download URL
//     encodes its slashes as %2F), so no '../' can lead a browser out of
//     the bucket.
//   - Google's account photos, the avatar a Google sign-in gives. The same
//     host serves shared Google Photos and Drive files, which nobody
//     screened, so only the /a/ and /a-/ paths are taken.
//   - Apple's CDN, which serves only Apple's own files.
const PUBLIC_PHOTO_URLS = [
  /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/adaptive-fitness-af8bb\.(firebasestorage\.app|appspot\.com)\/o\/(profile-photos|space-photos)%2F[^/\\?#]+([?#].*)?$/,
  /^https:\/\/lh3\.googleusercontent\.com\/a-?\/[^/\\?#%]+$/,
  /^https:\/\/appleid\.cdn-apple\.com\/.*/,
];

function publicPhotoUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  if (!PUBLIC_PHOTO_URLS.some((pattern) => pattern.test(value))) {
    return undefined;
  }
  try {
    const url = new URL(value);
    // Reject credentials and noncanonical input, including whitespace,
    // backslashes and dot segments; do not truncate a signed URL into a
    // different resource.
    if (url.username || url.password || value !== url.href) return undefined;
    return value;
  } catch (_) {
    return undefined;
  }
}

/**
 * The photo a person's public profile shows, as `publicPhotoUrl` passes it,
 * or undefined. Read inside the caller's transaction, so a comment or a
 * props row carries the photo the person chose and screened, never one a
 * request names.
 */
async function profilePhotoUrl(txn, firestore, uid) {
  const profile = await txn.get(
    firestore.collection("users").doc(uid).collection("public").doc("profile")
  );
  const data = (profile.exists && profile.data()) || {};
  return publicPhotoUrl(data.photoURL);
}

module.exports = { publicPhotoUrl, profilePhotoUrl };

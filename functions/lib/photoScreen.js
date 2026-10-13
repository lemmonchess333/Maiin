"use strict";

/**
 * Screening a photo other people will see (Ship1).
 *
 * Two kinds of upload reach other people: a Space post's photo
 * (`space-photos/{uid}/…`) and a profile photo (`profile-photos/{uid}/…`).
 * Each is checked with Google Cloud Vision's SafeSearch before anyone
 * else can see it. The owner's call: refuse nudity and nothing else, so a
 * photo SafeSearch rates LIKELY or VERY_LIKELY "adult" is refused and its
 * file deleted, while "racy" (a shirtless gym photo, a sports bra) passes.
 *
 * Two ways in, one check:
 *   - The `screenPhoto` callable, which the app calls right after the
 *     upload and before it uses the photo, so the person hears straight
 *     away and nothing is posted.
 *   - The `screenUploadedPhoto` Storage trigger, which checks every such
 *     upload again, so a client that skips the callable still loses the
 *     file.
 * The Cloud Vision API must be enabled in the project. Until it is, the
 * callable answers "unavailable" and the app posts no photo.
 */

const SCREENED_PATHS = [
  /^space-photos\/([^/]+)\/[^/]+$/,
  /^profile-photos\/([^/]+)\/[^/]+$/,
];

/** SafeSearch's likelihoods at which a photo is refused as nudity. */
const REFUSED_ADULT_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/** The uid a screened path belongs to, or null for a path not screened. */
function screenedOwner(path) {
  if (typeof path !== "string" || path.includes("..")) return null;
  for (const pattern of SCREENED_PATHS) {
    const match = pattern.exec(path);
    if (match) return match[1];
  }
  return null;
}

/** Whether SafeSearch's annotation refuses the photo as nudity. */
function refusesPhoto(annotation) {
  return Boolean(annotation && REFUSED_ADULT_LIKELIHOODS.has(annotation.adult));
}

/** SafeSearch's annotation of an image. Throws when Vision answers with
 *  an error, the API being off included. */
async function safeSearch(bytes, accessToken, fetchImpl = fetch) {
  const response = await fetchImpl(VISION_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: Buffer.from(bytes).toString("base64") },
          features: [{ type: "SAFE_SEARCH_DETECTION" }],
        },
      ],
    }),
  });
  const data = await response.json().catch(() => null);
  const result = data && Array.isArray(data.responses) && data.responses[0];
  if (!response.ok || !result || result.error || !result.safeSearchAnnotation)
    throw new Error(
      `SafeSearch failed (${response.status}): ${
        (result && result.error && result.error.message) ||
        (data && data.error && data.error.message) ||
        "no annotation"
      }`
    );
  return result.safeSearchAnnotation;
}

/**
 * Screens a stored photo, deleting it when refused.
 * @returns {Promise<{refused: boolean, adult: string}>}
 */
async function screenStoredPhoto({ bucket, path, accessToken, fetchImpl }) {
  const file = bucket.file(path);
  const [bytes] = await file.download();
  const annotation = await safeSearch(bytes, accessToken, fetchImpl);
  const refused = refusesPhoto(annotation);
  if (refused) await file.delete({ ignoreNotFound: true });
  return { refused, adult: annotation.adult };
}

module.exports = {
  REFUSED_ADULT_LIKELIHOODS,
  refusesPhoto,
  safeSearch,
  screenStoredPhoto,
  screenedOwner,
};

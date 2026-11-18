"use strict";

/**
 * Screening a photo other people will see (Ship1).
 *
 * Four kinds of upload reach other people: a Space post's photo
 * (`space-photos/{uid}/…`), a profile photo (`profile-photos/{uid}/…`),
 * a run post's map image (`route-maps/{uid}/…`, Soc15 call 5) and a
 * shared session's photos (`post-photos/{uid}/…`, Soc15 call 2). The
 * app draws a map, but any client may put any JPEG at its own path, so a
 * map is screened as a photo is.
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
  /^space-photos\/([^/]+)(?:\/[\s\S]*)?$/,
  /^profile-photos\/([^/]+)(?:\/[\s\S]*)?$/,
  /^route-maps\/([^/]+)(?:\/[\s\S]*)?$/,
  /^post-photos\/([^/]+)(?:\/[\s\S]*)?$/,
];

/**
 * How many screens one account's photos may cost in a day (Tropos
 * heuristics, a rolling day). Every screen is a paid Cloud Vision request,
 * and nothing in Storage limits how many files an account uploads: before
 * these, a script uploading to its own folders cost one request a file
 * with no end, and the callable could be sent the same path about 4,300
 * times a day. A busy day of real use is a profile photo, a few Space
 * posts and three shared sessions with four photos and two maps each,
 * about 25 uploads, each screened once by the trigger and once by the
 * callable; a hundred of each is four times that.
 *   - the trigger's screens of uploads: over the day's number, an upload
 *     is deleted unscreened, as nothing unscreened may be shown;
 *   - the callable's screens: over the day's number it refuses, and the
 *     app treats that as a photo it couldn't check and posts nothing.
 */
const UPLOAD_SCREENS_PER_DAY = 100;
const CALLABLE_SCREENS_PER_DAY = 100;
const SCREEN_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Claims one of the owner's upload screens for today, once per event: a
 * retried delivery of an upload already counted screens again without
 * counting again. Without that, the retries of one upload while Vision was
 * failing (backoff of minutes, for a day) spent the owner's whole day, and
 * every photo they uploaded after it was deleted on arrival.
 *
 * Kept in the rate limiter's own collection and shape
 * (`rateLimits/{owner}_photoUploadScreenDay`, `timestamps` and an
 * `expiresAt` for its TTL), which account deletion already sweeps by the
 * uid prefix, with the events counted beside them. Throws when the count
 * cannot be read or written, so the trigger is delivered again rather than
 * reading an outage as "over".
 *
 * @returns {Promise<boolean>} true to screen, false when over the day's number
 */
async function claimUploadScreen(db, { owner, eventId, now = Date.now() }) {
  const ref = db.collection("rateLimits").doc(`${owner}_photoUploadScreenDay`);
  const since = now - SCREEN_BUDGET_WINDOW_MS;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists && snap.data()) || {};
    const counted = (Array.isArray(data.timestamps) ? data.timestamps : [])
      .filter((t) => typeof t === "number" && t > since);
    const events = (Array.isArray(data.events) ? data.events : []).filter(
      (e) => e && typeof e.id === "string" && typeof e.at === "number" && e.at > since
    );
    if (typeof eventId === "string" && events.some((e) => e.id === eventId))
      return true;
    if (counted.length >= UPLOAD_SCREENS_PER_DAY) return false;
    counted.push(now);
    if (typeof eventId === "string") events.push({ id: eventId, at: now });
    tx.set(ref, {
      timestamps: counted.slice(-UPLOAD_SCREENS_PER_DAY),
      events: events.slice(-UPLOAD_SCREENS_PER_DAY),
      updatedAt: new Date(now),
      expiresAt: new Date(now + SCREEN_BUDGET_WINDOW_MS),
    });
    return true;
  });
}

/** SafeSearch's likelihoods at which a photo is refused as nudity. */
const REFUSED_ADULT_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/** The uid a screened path belongs to, or null for a path not screened. */
function screenedOwner(path) {
  // Storage rules allow every object below these owner prefixes, including
  // nested keys (and the owner key itself: their v2 wildcard matches zero
  // segments). Object names are opaque: '..' has no filesystem traversal
  // meaning here and must not let an otherwise public upload skip screening.
  if (typeof path !== "string") return null;
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

/** The object at `path`, held to one generation for reads and deletes, so
 *  a newer upload at the same path is never the one read or deleted. */
function pinnedFile(bucket, path, generation) {
  // The Storage SDK converts the generation selector to a number. Refuse
  // values it cannot represent exactly instead of selecting other bytes.
  if (typeof generation !== "string" || !/^[0-9]+$/.test(generation)
      || !Number.isSafeInteger(Number(generation)) || Number(generation) <= 0) {
    throw new Error("Photo generation unavailable");
  }
  return bucket.file(path, {
    generation,
    preconditionOpts: { ifGenerationMatch: generation },
  });
}

/**
 * Deletes an upload that will not be screened: over its owner's day of
 * screens, or past a day of Vision failing. Nothing unscreened may be
 * shown, and the app posts no photo it couldn't check either.
 */
async function deleteUnscreenedPhoto({ bucket, path, generation }) {
  try {
    await pinnedFile(bucket, path, generation).delete({ ignoreNotFound: true });
  } catch (err) {
    // A newer upload took its place: that one has its own event.
    if (err && err.code === 412) return;
    throw err;
  }
}

/**
 * Screens a stored photo, deleting it when refused.
 * @returns {Promise<{refused: boolean, adult: string}>}
 */
async function screenStoredPhoto({
  bucket, path, generation, accessToken, fetchImpl,
}) {
  // Pin the bytes and any deletion to the SAME immutable object generation.
  // A replacement can arrive while Vision is checking the old image, or a
  // finalize event can arrive late. Never screen or delete the newer upload.
  if (generation === undefined) {
    const [metadata] = await bucket.file(path).getMetadata();
    generation = metadata.generation;
  }
  const file = pinnedFile(bucket, path, generation);
  const [bytes] = await file.download();
  const annotation = await safeSearch(bytes, accessToken, fetchImpl);
  const refused = refusesPhoto(annotation);
  if (refused) {
    await file.delete({ ignoreNotFound: true });
  }
  return { refused, adult: annotation.adult };
}

module.exports = {
  CALLABLE_SCREENS_PER_DAY,
  claimUploadScreen,
  SCREEN_BUDGET_WINDOW_MS,
  UPLOAD_SCREENS_PER_DAY,
  REFUSED_ADULT_LIKELIHOODS,
  deleteUnscreenedPhoto,
  refusesPhoto,
  safeSearch,
  screenStoredPhoto,
  screenedOwner,
};

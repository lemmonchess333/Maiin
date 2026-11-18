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
 *     away and nothing is posted. A photo it passes is recorded, so the
 *     trigger does not screen it again.
 *   - The `screenUploadedPhoto` Storage trigger, which checks every other
 *     such upload, so a client that skips the callable still loses the
 *     file.
 *
 * A person's photo is never deleted because Vision was down or switched
 * off. Only the photo itself is grounds: refused as nudity, an image
 * Vision cannot read, or past its owner's day of screens.
 * The Cloud Vision API must be enabled in the project. Until it is, the
 * callable answers "unavailable" and the app posts no photo, and the
 * trigger keeps each upload, marked unscreened, after a day of retries.
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
 * and nothing in Storage limits how many files an account uploads: without
 * these, a script uploading to its own folders costs one request a file
 * with no end, and the callable can be sent the same path about 4,300
 * times a day. A busy day of real use is a profile photo, a few Space
 * posts and three shared sessions with four photos and two maps each,
 * about 25 uploads, each screened once by the callable and, when the
 * trigger runs first, once by the trigger; a hundred of each is four
 * times that.
 *   - the trigger's screens of uploads: over the day's number, an upload
 *     is deleted unscreened, as nothing unscreened may be shown, unless
 *     the callable passed that very file;
 *   - the callable's screens: over the day's number it refuses, and the
 *     app treats that as a photo it couldn't check and posts nothing.
 */
const UPLOAD_SCREENS_PER_DAY = 100;
const CALLABLE_SCREENS_PER_DAY = 100;
const SCREEN_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The owner's day of upload screens, one document for the trigger and the
 * callable both: `rateLimits/{owner}_photoUploadScreenDay`, in the rate
 * limiter's own collection and shape (`timestamps`, and an `expiresAt` for
 * its TTL), which account deletion already sweeps by the uid prefix.
 *   - `timestamps`: the trigger's screens counted in the day;
 *   - `events`: the trigger events those were for, so a retried delivery
 *     of an upload already counted is not counted again;
 *   - `passed`: the uploads (path and generation) the callable passed;
 *   - `dropped`: the uploads the trigger deleted on the day's budget.
 * `passed` and `dropped` are claimed in transactions on this one document,
 * so the callable and the trigger never both act on one file: once the
 * callable has passed it the trigger keeps it, and once the trigger has
 * dropped it the callable answers that it couldn't check it.
 */
function budgetRef(db, owner) {
  return db.collection("rateLimits").doc(`${owner}_photoUploadScreenDay`);
}

const isUpload = (e) =>
  Boolean(e) &&
  typeof e.path === "string" &&
  typeof e.generation === "string" &&
  typeof e.at === "number";

/** The budget's entries still inside the day, each list in its own shape. */
function readBudget(snap, since) {
  const data = (snap.exists && snap.data()) || {};
  const list = (value, valid) =>
    (Array.isArray(value) ? value : []).filter((e) => valid(e));
  return {
    counted: list(data.timestamps, (t) => typeof t === "number" && t > since),
    events: list(
      data.events,
      (e) => e && typeof e.id === "string" && typeof e.at === "number" && e.at > since
    ),
    passed: list(data.passed, (e) => isUpload(e) && e.at > since),
    dropped: list(data.dropped, (e) => isUpload(e) && e.at > since),
  };
}

function writeBudget(tx, ref, budget, now) {
  tx.set(ref, {
    timestamps: budget.counted.slice(-UPLOAD_SCREENS_PER_DAY),
    events: budget.events.slice(-UPLOAD_SCREENS_PER_DAY),
    passed: budget.passed.slice(-CALLABLE_SCREENS_PER_DAY),
    dropped: budget.dropped.slice(-UPLOAD_SCREENS_PER_DAY),
    updatedAt: new Date(now),
    expiresAt: new Date(now + SCREEN_BUDGET_WINDOW_MS),
  });
}

const sameUpload = (path, generation) => (e) =>
  e.path === path && e.generation === generation;

/**
 * Claims one of the owner's upload screens for today, once per event: a
 * retried delivery of an upload already counted screens again without
 * counting again. Without that, the retries of one upload while Vision is
 * failing (backoff of minutes, for a day) spend the owner's whole day, and
 * every photo they upload after it is deleted on arrival.
 *
 * Throws when the count cannot be read or written, so the trigger is
 * delivered again rather than reading an outage as "over".
 *
 * @returns {Promise<"screen"|"passed"|"over">} "passed" when the callable
 *   already passed this very file (nothing to do), "over" when the day's
 *   screens are spent (recorded as dropped, so the callable will not pass
 *   it after this)
 */
async function claimUploadScreen(
  db,
  { owner, path, generation, eventId, now = Date.now() }
) {
  const ref = budgetRef(db, owner);
  const since = now - SCREEN_BUDGET_WINDOW_MS;
  const known = typeof path === "string" && typeof generation === "string";
  return db.runTransaction(async (tx) => {
    const budget = readBudget(await tx.get(ref), since);
    if (known && budget.passed.some(sameUpload(path, generation)))
      return "passed";
    if (typeof eventId === "string" && budget.events.some((e) => e.id === eventId))
      return "screen";
    if (budget.counted.length >= UPLOAD_SCREENS_PER_DAY) {
      if (known && !budget.dropped.some(sameUpload(path, generation))) {
        budget.dropped.push({ path, generation, at: now });
        writeBudget(tx, ref, budget, now);
      }
      return "over";
    }
    budget.counted.push(now);
    if (typeof eventId === "string") budget.events.push({ id: eventId, at: now });
    writeBudget(tx, ref, budget, now);
    return "screen";
  });
}

/**
 * Records that the callable passed this upload, so the trigger neither
 * screens it again nor deletes it on the owner's day of screens. Throws
 * when the record cannot be written; the callable then answers that it
 * couldn't check the photo, so the app posts nothing the trigger might
 * still delete.
 *
 * @returns {Promise<boolean>} false when the trigger has already dropped
 *   this upload on the day's budget: its file is gone or going
 */
async function recordCallablePass(
  db,
  { owner, path, generation, now = Date.now() }
) {
  const ref = budgetRef(db, owner);
  const since = now - SCREEN_BUDGET_WINDOW_MS;
  return db.runTransaction(async (tx) => {
    const budget = readBudget(await tx.get(ref), since);
    if (budget.dropped.some(sameUpload(path, generation))) return false;
    if (!budget.passed.some(sameUpload(path, generation))) {
      budget.passed.push({ path, generation, at: now });
      writeBudget(tx, ref, budget, now);
    }
    return true;
  });
}

/** SafeSearch's likelihoods at which a photo is refused as nudity. */
const REFUSED_ADULT_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/**
 * Vision's limit on one request's JSON (its documented content limits:
 * "Base64-encoded images may exceed the JSON size limit, even if they are
 * within the image file size limit"). A photo whose request is larger is
 * refused by Vision every time, so it can never be screened. Storage
 * allows a Space photo up to 10 MB, about 13.3 MB as base64; the app
 * re-encodes every photo far under this.
 */
const VISION_REQUEST_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * The google.rpc code Vision gives one image it cannot read ("Bad image
 * data"): INVALID_ARGUMENT. The only per-image error read as the photo's
 * own fault. Any other (DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, INTERNAL,
 * UNAVAILABLE, a permission error) is the service failing.
 */
const UNREADABLE_IMAGE_CODE = 3;

/** A photo Vision will never screen: unreadable, or too large to send. */
class UnscreenablePhotoError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnscreenablePhotoError";
  }
}

/** Whether `error` says the photo itself can't be screened, as opposed to
 *  Vision, Storage or Firestore failing, which is never the photo's fault. */
function isUnscreenable(error) {
  return error instanceof UnscreenablePhotoError;
}

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

/**
 * SafeSearch's annotation of an image. Throws `UnscreenablePhotoError`
 * for an image Vision cannot read or will not take, and an ordinary
 * error when the service fails (a transport error, an HTTP error status,
 * the API off, quota spent, any other per-image error, no annotation).
 */
async function safeSearch(bytes, accessToken, fetchImpl = fetch) {
  const body = JSON.stringify({
    requests: [
      {
        image: { content: Buffer.from(bytes).toString("base64") },
        features: [{ type: "SAFE_SEARCH_DETECTION" }],
      },
    ],
  });
  if (body.length > VISION_REQUEST_LIMIT_BYTES)
    throw new UnscreenablePhotoError(
      `Photo too large for Vision (${bytes.length} bytes)`
    );
  const response = await fetchImpl(VISION_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body,
  });
  const data = await response.json().catch(() => null);
  const result = data && Array.isArray(data.responses) && data.responses[0];
  if (!response.ok)
    throw new Error(
      `SafeSearch failed (${response.status}): ${
        (data && data.error && data.error.message) || "no annotation"
      }`
    );
  if (result && result.error) {
    const message = `SafeSearch failed (${response.status}, code ${
      result.error.code
    }): ${result.error.message || "per-image error"}`;
    if (result.error.code === UNREADABLE_IMAGE_CODE)
      throw new UnscreenablePhotoError(message);
    throw new Error(message);
  }
  if (!result || !result.safeSearchAnnotation)
    throw new Error(`SafeSearch failed (${response.status}): no annotation`);
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
 * screens, or one Vision cannot read. Nothing unscreened may be shown,
 * and the app posts no photo it couldn't check either.
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
 * Marks an upload the trigger could not screen within its retry window,
 * and keeps it: the service failed, not the photo. The mark is the
 * object's own metadata, so it goes with the file, and finds what to
 * screen again once Vision is back. Clients may write their own uploads'
 * metadata, so the mark is a list for an operator, never a gate.
 */
async function markUnscreenedPhoto({
  bucket, path, generation, now = Date.now(),
}) {
  await pinnedFile(bucket, path, generation).setMetadata({
    metadata: {
      screen: "unscreened",
      screenGaveUpAt: new Date(now).toISOString(),
    },
  });
}

/**
 * Screens a stored photo, deleting it when refused.
 * @returns {Promise<{refused: boolean, adult: string, generation: string}>}
 *   with the generation screened
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
  return { refused, adult: annotation.adult, generation };
}

module.exports = {
  CALLABLE_SCREENS_PER_DAY,
  claimUploadScreen,
  recordCallablePass,
  SCREEN_BUDGET_WINDOW_MS,
  UPLOAD_SCREENS_PER_DAY,
  REFUSED_ADULT_LIKELIHOODS,
  UNREADABLE_IMAGE_CODE,
  UnscreenablePhotoError,
  VISION_REQUEST_LIMIT_BYTES,
  deleteUnscreenedPhoto,
  isUnscreenable,
  markUnscreenedPhoto,
  refusesPhoto,
  safeSearch,
  screenStoredPhoto,
  screenedOwner,
};

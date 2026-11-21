#!/usr/bin/env node
"use strict";

/**
 * Delete every meal photo older builds stored on the server (Food9,
 * operator-run; owner, 21 November 2026: "Delete them all").
 *
 * From 4 July to 18 August 2026 (Food8 until Food9) the app uploaded each
 * AI-scanned meal's photo to Storage, `food-photos/{uid}/{timestamp}.jpg`,
 * and wrote its download URL (`photoUrl`) and its path (`photoPath`) onto
 * the meal. Food9 moved meal photos onto the device and stopped both
 * writes; storage.rules has refused any upload there since 25 October; and
 * the release this script came with stopped the app reading `photoUrl` and
 * made the prefix unreadable to clients. What was uploaded before Food9 is
 * still in the bucket, and this deletes it:
 *
 *   - every object under `food-photos/` in the bucket named, whoever's it
 *     is, a deleted meal's and a live one's alike, and nothing outside the
 *     prefix;
 *   - `photoUrl` and `photoPath` on every meal that has either
 *     (`users/{uid}/meals/{mealId}`, soft-deleted ones included), with
 *     `FieldValue.delete()`. Nothing else on a meal is touched.
 *
 * Usage, from the repo root, once Deploy production has shipped the release
 * that stopped the app reading the field:
 *
 *   node functions/scripts/purgeLegacyFoodPhotos.js --project PROJECT_ID --bucket BUCKET
 *   node functions/scripts/purgeLegacyFoodPhotos.js --project PROJECT_ID --bucket BUCKET --apply
 *   Optional: --after users/UID/meals/MEAL_ID (resume the meals after a
 *   checkpoint), --max-pages N
 *
 * BUCKET is the project's default Storage bucket as Firebase console →
 * Storage shows it, without `gs://` (`PROJECT_ID.firebasestorage.app` or
 * `PROJECT_ID.appspot.com`; the app's own `VITE_FIREBASE_STORAGE_BUCKET`,
 * which is where older builds uploaded). Each meal's `photoUrl` names the
 * bucket its photo is in, and the run reads every meal first: if any names
 * another bucket, it stops before deleting or writing anything, a dry run
 * included, and says which bucket to name instead. A URL it cannot read a
 * bucket out of (another host, gs://, a malformed value) stops it the same
 * way, and the dry run says how many URLs named the bucket, so the check is
 * seen to have had something to check. A bucket that does not exist stops
 * it too.
 *
 * The Actions tab runs it too, with the production credentials and no
 * terminal: .github/workflows/purge-legacy-food-photos.yml (a dry run
 * unless "apply" is chosen).
 *
 * Requirements: `npm ci` in functions/, and GOOGLE_APPLICATION_CREDENTIALS
 * pointing at a service account with Firestore access and
 * `storage.objects.list` and `storage.objects.delete` on the bucket, or
 * gcloud ADC (`gcloud auth application-default login`).
 *
 * Without `--apply` it is a dry run that deletes and writes nothing: it
 * reports how many objects (and bytes) are under the prefix and how many
 * meals hold each field. With `--apply` it checks the meals, then deletes
 * the objects, a page of 1000 at a time, a missing object counted as done;
 * then the fields, one batch per page of 200 meals, printing a checkpoint
 * after each page (the counts so far and the last meal's path). An object
 * it cannot delete stops the run before any meal is written. A batch is all
 * or nothing, so a page that fails (a meal deleted while the run reached
 * it, say) writes nothing, and running again, from the start or with
 * `--after` the last checkpoint's path, finishes it: the objects already
 * deleted are not listed again, and a meal with neither field is not
 * written. The output is counts and the checkpoint path, nothing else about
 * an account.
 *
 * Every `meals` document is read (twice with `--apply`: the check, then
 * the writes) rather than queried for the fields: a collection-group query
 * on `photoUrl` needs an index this project does not keep, for a field
 * nothing else asks about. Only the two fields are fetched (`select`). Each meal written fires `onMealWritten` once, which returns
 * before reading anything: removing a photo changes nothing a badge reads.
 *
 * Account deletion keeps its sweep of `food-photos/{uid}/` (an empty prefix
 * costs one list call), so an account deleted before this has run loses its
 * photos either way.
 */

const { FieldPath } = require("firebase-admin/firestore");

/** Every object older builds uploaded for a meal is under this prefix. */
const FOOD_PHOTO_PREFIX = "food-photos/";

/** The fields older builds wrote onto a meal for its photo
 *  (src/lib/foodPhotoUpload.ts, deleted with Food9). */
const MEAL_PHOTO_FIELDS = Object.freeze(["photoUrl", "photoPath"]);

/** A person's meal. Another collection named `meals` is not one. */
const MEAL_PATH = /^users\/[^/]+\/meals\/[^/]+$/;

/** One batch per page of meals, well under Firestore's 500 writes. */
const PAGE_SIZE = 200;

/** Objects listed (and deleted) per page. */
const OBJECT_PAGE_SIZE = 1000;

/** The photo fields a stored meal holds, a stored `null` included. */
function storedPhotoFields(data) {
  return MEAL_PHOTO_FIELDS.filter(
    (field) => !!data && Object.prototype.hasOwnProperty.call(data, field)
  );
}

/**
 * One page of the listing. A bucket that does not exist answers 404, which
 * is the check that --bucket names the right one: listing needs only the
 * object permissions the purge needs anyway, where `bucket.exists()` needs
 * `storage.buckets.get` as well.
 */
async function listPage(bucket, query) {
  try {
    return await bucket.getFiles(query);
  } catch (err) {
    if (err && (err.code === 404 || err.code === "404")) {
      throw new Error(
        "That bucket does not exist. Name the bucket the app stores photos in with --bucket, as Firebase console → Storage shows it."
      );
    }
    throw err;
  }
}

/** Every object under the prefix, a page at a time; deleted with --apply. */
async function purgeObjects({ bucket, apply, objectPageSize, report }) {
  let query = {
    prefix: FOOD_PHOTO_PREFIX,
    maxResults: objectPageSize,
    autoPaginate: false,
  };
  while (query) {
    const [files, next] = await listPage(bucket, query);
    for (const file of files) {
      report.objects += 1;
      report.bytes += Number((file.metadata && file.metadata.size) || 0);
      if (!apply) continue;
      await file.delete({ ignoreNotFound: true });
      report.objectsDeleted += 1;
    }
    query =
      next && next.pageToken ? { ...query, pageToken: next.pageToken } : null;
  }
}

/**
 * The bucket a meal's download URL names
 * (`https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{object}`), or
 * null when the value is not one. A path (`photoPath`) names no bucket.
 */
function photoUrlBucket(photoUrl) {
  if (typeof photoUrl !== "string" || !photoUrl) return null;
  let url;
  try {
    url = new URL(photoUrl);
  } catch {
    return null;
  }
  if (url.hostname !== "firebasestorage.googleapis.com") return null;
  const match = /^\/v0\/b\/([^/]+)\/o\//.exec(url.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Every page of meals from `after`, at most `maxPages` of them, handed to
 * `visit` with the documents that are a person's meal and the count of
 * those that are not. Returns where it stopped.
 */
async function eachMealPage({ firestore, after, maxPages, visit }) {
  const query = firestore
    .collectionGroup("meals")
    .orderBy(FieldPath.documentId())
    .select(...MEAL_PHOTO_FIELDS)
    .limit(PAGE_SIZE);
  let cursor = after ? firestore.doc(after) : null;
  let pages = 0;
  while (pages < maxPages) {
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    if (page.docs.length === 0) break;
    const meals = page.docs.filter((doc) => MEAL_PATH.test(doc.ref.path));
    cursor = page.docs[page.docs.length - 1].ref;
    pages += 1;
    await visit({
      meals,
      foreign: page.docs.length - meals.length,
      cursor: cursor.path,
      pages,
    });
    if (page.docs.length < PAGE_SIZE) break;
  }
}

/** Whether a meal holds a photo URL at all: a stored null or empty string
 *  is a field with nothing in it, and names no photo. */
function holdsPhotoUrl(data) {
  return (
    Object.prototype.hasOwnProperty.call(data, "photoUrl") &&
    data.photoUrl !== null &&
    data.photoUrl !== ""
  );
}

/** Why the run stops when a meal's photo is in another bucket. */
function otherBucketError(buckets, bucketName) {
  const named = [...buckets].sort();
  return new Error(
    `The meals' photos are in ${named.join(", ")}, not ${bucketName}. Nothing was deleted or written: run again with --bucket ${named[0]}.`
  );
}

/**
 * `fieldDelete` is `FieldValue.delete()` and `bucket` a Storage bucket,
 * passed in so the logic runs against fakes without the Admin SDK.
 *
 * Three steps. First every meal is read, counted and checked: a meal whose
 * download URL names a bucket other than `bucket`, or whose URL names no
 * bucket the script can read, stops the run before anything is deleted or
 * written, a dry run included. A bucket that exists
 * but is the wrong one lists nothing under the prefix and answers no 404,
 * so without this an apply would strip every meal of the only record of
 * where its photo is, and its recount would pass. The check reads the
 * meals, never the counts, so a run again after an apply that stopped
 * part-way (objects gone, meals not yet stripped) goes on. Then the
 * objects; then, with --apply, the fields, a batch per page. Nothing
 * writes a meal's photoUrl any more, so the meals the second pass strips
 * are the ones the first pass checked.
 */
async function purgeLegacyFoodPhotos({
  firestore,
  bucket,
  fieldDelete,
  apply = false,
  after = null,
  maxPages = Infinity,
  objectPageSize = OBJECT_PAGE_SIZE,
  onPage = () => {},
}) {
  const report = {
    objects: 0,
    bytes: 0,
    objectsDeleted: 0,
    scanned: 0,
    foreign: 0,
    holding: 0,
    fields: Object.fromEntries(MEAL_PHOTO_FIELDS.map((field) => [field, 0])),
    urlsInBucket: 0,
    stripped: 0,
    pages: 0,
    cursor: after,
    dryRun: !apply,
  };
  const checkpoint = (cursor, pages) => {
    report.cursor = cursor;
    report.pages = pages;
    return onPage({ ...report, fields: { ...report.fields } });
  };

  const otherBuckets = new Set();
  let unreadableUrls = 0;
  await eachMealPage({
    firestore,
    after,
    maxPages,
    visit: async ({ meals, foreign, cursor, pages }) => {
      report.foreign += foreign;
      for (const doc of meals) {
        report.scanned += 1;
        const data = doc.data() || {};
        const fields = storedPhotoFields(data);
        if (fields.length === 0) continue;
        report.holding += 1;
        for (const field of fields) report.fields[field] += 1;
        if (!holdsPhotoUrl(data)) continue;
        // Safe by default: a URL whose bucket cannot be read is not passed
        // unexamined, or a run whose every URL is in an unexpected form
        // would strip them all with the bucket check never firing.
        const named = photoUrlBucket(data.photoUrl);
        if (!named) unreadableUrls += 1;
        else if (named === bucket.name) report.urlsInBucket += 1;
        else otherBuckets.add(named);
      }
      // A dry run's checkpoints are this pass's; an apply's, the writes'.
      if (!apply) await checkpoint(cursor, pages);
    },
  });
  if (otherBuckets.size > 0) throw otherBucketError(otherBuckets, bucket.name);
  if (unreadableUrls > 0) {
    throw new Error(
      `${unreadableUrls} meal(s) hold a photo URL this script cannot read, so it cannot tell which bucket their photos are in. Nothing was deleted or written.`
    );
  }

  // The photos before the fields: a run that stops part-way leaves fields
  // pointing at nothing, which no build shows.
  await purgeObjects({ bucket, apply, objectPageSize, report });

  if (!apply) return report;
  await eachMealPage({
    firestore,
    after,
    maxPages,
    visit: async ({ meals, cursor, pages }) => {
      const batch = firestore.batch();
      let writes = 0;
      for (const doc of meals) {
        const data = doc.data() || {};
        const fields = storedPhotoFields(data);
        if (fields.length === 0) continue;
        batch.update(
          doc.ref,
          Object.fromEntries(fields.map((field) => [field, fieldDelete]))
        );
        writes += 1;
      }
      if (writes > 0) {
        await batch.commit();
        report.stripped += writes;
      }
      await checkpoint(cursor, pages);
    },
  });
  return report;
}

/**
 * The run's last line. The workflow's recount greps the dry run's form of
 * it for 0 objects and 0 meals, so its wording is pinned to that pattern
 * (purgeLegacyFoodPhotos.test.js reads it out of the workflow).
 */
function summaryLine(report) {
  return report.dryRun
    ? `DRY RUN: ${report.objects} object(s) under ${FOOD_PHOTO_PREFIX} and ${report.holding} of ${report.scanned} meal(s) hold a photo field; ${report.urlsInBucket} of their photo URLs name this bucket. Nothing was deleted; run again with --apply to delete them.`
    : `Deleted ${report.objectsDeleted} object(s) under ${FOOD_PHOTO_PREFIX} and took the photo fields off ${report.stripped} of ${report.scanned} meal(s).`;
}

function parseArgs(args) {
  const options = {
    apply: false,
    projectId: null,
    bucketName: null,
    after: null,
    maxPages: Infinity,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--project") options.projectId = args[++i];
    else if (arg === "--bucket") options.bucketName = args[++i];
    else if (arg === "--after") options.after = args[++i];
    else if (arg === "--max-pages") options.maxPages = Number(args[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId || !/^[a-z][a-z0-9-]+$/.test(options.projectId)) {
    throw new Error("An explicit --project PROJECT_ID is required.");
  }
  if (
    !options.bucketName ||
    !/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/.test(options.bucketName)
  ) {
    throw new Error(
      "An explicit --bucket BUCKET is required: the default bucket's name, without gs://."
    );
  }
  if (options.after !== null && !MEAL_PATH.test(String(options.after))) {
    throw new Error(
      "--after must be a checkpoint's path, users/UID/meals/MEAL_ID, from a completed page."
    );
  }
  if (
    options.maxPages !== Infinity &&
    (!Number.isInteger(options.maxPages) || options.maxPages < 1)
  ) {
    throw new Error("--max-pages must be a positive integer.");
  }
  return options;
}

module.exports = {
  FOOD_PHOTO_PREFIX,
  MEAL_PHOTO_FIELDS,
  storedPhotoFields,
  photoUrlBucket,
  purgeLegacyFoodPhotos,
  summaryLine,
  parseArgs,
};

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs(process.argv.slice(2));
      const admin = require("../lib/adminSdk");
      admin.initializeApp({
        projectId: options.projectId,
        storageBucket: options.bucketName,
      });
      const report = await purgeLegacyFoodPhotos({
        ...options,
        firestore: admin.firestore(),
        bucket: admin.storage().bucket(options.bucketName),
        fieldDelete: admin.firestore.FieldValue.delete(),
        onPage: (checkpoint) => console.log(JSON.stringify(checkpoint)),
      });
      console.log(
        JSON.stringify(
          {
            projectId: options.projectId,
            bucket: options.bucketName,
            ...report,
          },
          null,
          2
        )
      );
      console.log(summaryLine(report));
    })
    .catch((error) => {
      console.error("Meal photo purge failed:", error.message);
      process.exitCode = 1;
    });
}

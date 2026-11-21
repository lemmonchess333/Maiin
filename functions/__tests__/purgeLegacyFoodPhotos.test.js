/**
 * The purge of the meal photos older builds stored on the server (Food9,
 * owner 2026-11-21: "Delete them all"). A dry run counts and changes
 * nothing; --apply deletes every object under `food-photos/` and nothing
 * outside it, and takes the two photo fields off every meal that has one,
 * leaving the rest of the meal; it pages, resumes, and a second run finds
 * nothing.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  memoryFirestore,
  fieldDelete,
} = require("./helpers/memoryFirestore.cjs");
const {
  FOOD_PHOTO_PREFIX,
  MEAL_PHOTO_FIELDS,
  storedPhotoFields,
  purgeLegacyFoodPhotos,
  parseArgs,
} = require("../scripts/purgeLegacyFoodPhotos");

const DELETE = fieldDelete();
const BUCKET = "demo-tropos.firebasestorage.app";

/**
 * A bucket as the Storage SDK's: getFiles lists by prefix in name order,
 * a page at a time (`autoPaginate: false` hands back the next query), and
 * a file's delete with `ignoreNotFound` treats a missing object as done.
 */
function fakeBucket(objects, { failDelete = null, missing = false } = {}) {
  const stored = new Map(Object.entries(objects));
  const deleteCalls = [];
  const file = (name) => ({
    name,
    metadata: { size: String(stored.get(name) ?? 0) },
    delete: async (options = {}) => {
      deleteCalls.push({ name, options });
      if (failDelete && failDelete(name)) {
        throw Object.assign(new Error("backend error"), { code: 503 });
      }
      if (!stored.has(name)) {
        if (options.ignoreNotFound) return;
        throw Object.assign(new Error("No such object"), { code: 404 });
      }
      stored.delete(name);
    },
  });
  return {
    name: BUCKET,
    stored,
    deleteCalls,
    file,
    getFiles: async ({ prefix = "", maxResults = 1000, pageToken } = {}) => {
      if (missing) {
        throw Object.assign(new Error("The specified bucket does not exist."), {
          code: 404,
        });
      }
      const names = [...stored.keys()]
        .filter((n) => n.startsWith(prefix))
        .sort()
        .filter((n) => !pageToken || n > pageToken);
      const page = names.slice(0, maxResults);
      const next =
        names.length > maxResults
          ? { prefix, maxResults, pageToken: page[page.length - 1] }
          : null;
      return [page.map(file), next];
    },
  };
}

const legacyUrl = (uid, ts) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
    `food-photos/${uid}/${ts}.jpg`
  )}?alt=media&token=t`;

/** A meal an older build scanned: the photo's download URL and its path. */
const scannedMeal = (uid, ts, extra = {}) => ({
  date: "2026-08-01",
  foodName: "Salmon bowl",
  totalCalories: 610,
  items: [{ name: "Salmon", calories: 610 }],
  confidence: "high",
  photoUrl: legacyUrl(uid, ts),
  photoPath: `food-photos/${uid}/${ts}.jpg`,
  ...extra,
});

const withoutPhoto = (meal) => {
  const { photoUrl: _url, photoPath: _path, ...rest } = meal;
  return rest;
};

const seededObjects = () => ({
  "food-photos/ana/1720000000000.jpg": 210_000,
  "food-photos/ana/1720000500000.jpg": 180_000,
  "food-photos/ben/1721000000000.jpg": 150_000,
  // Outside the prefix: never listed, never deleted.
  "profile-photos/ana/avatar.jpg": 40_000,
  "space-photos/ana/1.jpg": 90_000,
  "food-photos-archive/ana/x.jpg": 1_000,
});

const seededFirestore = () =>
  memoryFirestore({
    "users/ana/meals/m1": scannedMeal("ana", 1720000000000),
    // Soft-deleted in Recently deleted: its photo goes too.
    "users/ana/meals/m2": scannedMeal("ana", 1720000500000, {
      deletedAt: { seconds: 1 },
    }),
    // Only the URL, as a merge that landed half-way might leave.
    "users/ben/meals/m3": {
      ...withoutPhoto(scannedMeal("ben", 1)),
      photoUrl: legacyUrl("ben", 1721000000000),
    },
    // Typed: never had a photo, so is never written.
    "users/ben/meals/m4": withoutPhoto(scannedMeal("ben", 0)),
    // Not a person's meal: another collection named `meals` is left alone.
    "mealPlans/p1/meals/x": { photoUrl: "https://example.test/plan.jpg" },
  });

describe("purgeLegacyFoodPhotos", () => {
  it("names the prefix and the two fields older builds wrote", () => {
    expect(FOOD_PHOTO_PREFIX).toBe("food-photos/");
    expect(MEAL_PHOTO_FIELDS).toEqual(["photoUrl", "photoPath"]);
    expect(
      storedPhotoFields({ photoUrl: "u", photoPath: "p", date: "d" })
    ).toEqual(["photoUrl", "photoPath"]);
    expect(storedPhotoFields({ photoUrl: null })).toEqual(["photoUrl"]);
    expect(storedPhotoFields({ date: "d" })).toEqual([]);
  });

  it("a dry run is the default: it counts, and deletes and writes nothing", async () => {
    const bucket = fakeBucket(seededObjects());
    const fs = seededFirestore();
    const report = await purgeLegacyFoodPhotos({
      firestore: fs,
      bucket,
      fieldDelete: DELETE,
    });
    expect(report).toMatchObject({
      objects: 3,
      bytes: 540_000,
      objectsDeleted: 0,
      scanned: 4,
      foreign: 1,
      holding: 3,
      fields: { photoUrl: 3, photoPath: 2 },
      stripped: 0,
      dryRun: true,
    });
    expect(bucket.deleteCalls).toEqual([]);
    expect(bucket.stored.size).toBe(6);
    expect(fs.operations).toEqual([]);
  });

  it("--apply deletes every object under food-photos/ and nothing outside it", async () => {
    const bucket = fakeBucket(seededObjects());
    const report = await purgeLegacyFoodPhotos({
      firestore: seededFirestore(),
      bucket,
      fieldDelete: DELETE,
      apply: true,
    });
    expect(report).toMatchObject({ objects: 3, objectsDeleted: 3 });
    expect([...bucket.stored.keys()].sort()).toEqual([
      "food-photos-archive/ana/x.jpg",
      "profile-photos/ana/avatar.jpg",
      "space-photos/ana/1.jpg",
    ]);
    // A missing object is done, not a failure: another run, or the account
    // deletion's sweep, may have got there first.
    expect(bucket.deleteCalls.every((c) => c.options.ignoreNotFound)).toBe(
      true
    );
  });

  it("--apply takes the photo fields off every meal that has one and leaves the rest", async () => {
    const fs = seededFirestore();
    const report = await purgeLegacyFoodPhotos({
      firestore: fs,
      bucket: fakeBucket(seededObjects()),
      fieldDelete: DELETE,
      apply: true,
    });
    expect(report).toMatchObject({ holding: 3, stripped: 3, dryRun: false });
    expect(fs.data.get("users/ana/meals/m1")).toEqual(
      withoutPhoto(scannedMeal("ana", 1720000000000))
    );
    expect(fs.data.get("users/ana/meals/m2")).toEqual(
      withoutPhoto(
        scannedMeal("ana", 1720000500000, { deletedAt: { seconds: 1 } })
      )
    );
    expect(fs.data.get("users/ben/meals/m3")).toEqual(
      withoutPhoto(scannedMeal("ben", 1))
    );
    // Only the meals that held a field were written.
    expect(fs.operations.map(([, path]) => path)).toEqual([
      "users/ana/meals/m1",
      "users/ana/meals/m2",
      "users/ben/meals/m3",
    ]);
    expect(fs.data.get("mealPlans/p1/meals/x")).toEqual({
      photoUrl: "https://example.test/plan.jpg",
    });
  });

  it("a second run finds nothing, and its dry run reads 0 and 0", async () => {
    const fs = seededFirestore();
    const bucket = fakeBucket(seededObjects());
    await purgeLegacyFoodPhotos({
      firestore: fs,
      bucket,
      fieldDelete: DELETE,
      apply: true,
    });
    const again = await purgeLegacyFoodPhotos({
      firestore: fs,
      bucket,
      fieldDelete: DELETE,
    });
    expect(again).toMatchObject({
      objects: 0,
      holding: 0,
      scanned: 4,
      dryRun: true,
    });
  });

  it("pages through more objects and meals than one page holds, and resumes after a checkpoint", async () => {
    const objects = {};
    const seed = {};
    for (let i = 0; i < 450; i += 1) {
      const id = String(i).padStart(3, "0");
      objects[`food-photos/u${id}/1.jpg`] = 1;
      seed[`users/u${id}/meals/m`] = scannedMeal(`u${id}`, 1);
    }
    const bucket = fakeBucket(objects);
    const fs = memoryFirestore(seed);
    const checkpoints = [];
    // The bucket's pages are listed to the end whatever --max-pages says:
    // it bounds the meal scan, which is the part that resumes.
    const first = await purgeLegacyFoodPhotos({
      firestore: fs,
      bucket,
      fieldDelete: DELETE,
      apply: true,
      maxPages: 1,
      objectPageSize: 100,
      onPage: (checkpoint) => checkpoints.push(checkpoint),
    });
    expect(first).toMatchObject({
      objects: 450,
      objectsDeleted: 450,
      scanned: 200,
      stripped: 200,
      pages: 1,
    });
    expect(bucket.stored.size).toBe(0);
    expect(checkpoints.at(-1).cursor).toBe("users/u199/meals/m");

    const rest = await purgeLegacyFoodPhotos({
      firestore: fs,
      bucket,
      fieldDelete: DELETE,
      apply: true,
      after: parseArgs([
        "--project",
        "demo-tropos",
        "--bucket",
        BUCKET,
        "--after",
        checkpoints.at(-1).cursor,
      ]).after,
    });
    expect(rest).toMatchObject({ objects: 0, scanned: 250, stripped: 250 });
    expect(
      [...fs.data.values()].every(
        (d) => !("photoUrl" in d) && !("photoPath" in d)
      )
    ).toBe(true);
  });

  it("a page of meals that fails writes nothing, and running again finishes it", async () => {
    const fs = seededFirestore();
    fs.failures.set("update:users/ben/meals/m3", new Error("NOT_FOUND"));
    await expect(
      purgeLegacyFoodPhotos({
        firestore: fs,
        bucket: fakeBucket(seededObjects()),
        fieldDelete: DELETE,
        apply: true,
      })
    ).rejects.toThrow("NOT_FOUND");
    expect(fs.data.get("users/ana/meals/m1")).toEqual(
      scannedMeal("ana", 1720000000000)
    );

    fs.failures.clear();
    const again = await purgeLegacyFoodPhotos({
      firestore: fs,
      bucket: fakeBucket({}),
      fieldDelete: DELETE,
      apply: true,
    });
    expect(again).toMatchObject({ holding: 3, stripped: 3 });
  });

  it("an object it cannot delete fails the run before any meal is written", async () => {
    const fs = seededFirestore();
    const bucket = fakeBucket(seededObjects(), {
      failDelete: (name) => name.startsWith("food-photos/ben/"),
    });
    await expect(
      purgeLegacyFoodPhotos({
        firestore: fs,
        bucket,
        fieldDelete: DELETE,
        apply: true,
      })
    ).rejects.toThrow("backend error");
    expect(fs.operations).toEqual([]);
  });

  /* Listing the prefix is the check: it needs only the object permissions
     the purge needs anyway, where asking for the bucket itself
     (bucket.exists) needs storage.buckets.get, which the CI account that
     runs this may not hold. */
  it("refuses a bucket that does not exist, before reading any meal", async () => {
    const bucket = fakeBucket(seededObjects(), { missing: true });
    const fs = seededFirestore();
    await expect(
      purgeLegacyFoodPhotos({ firestore: fs, bucket, fieldDelete: DELETE })
    ).rejects.toThrow(/--bucket/);
    expect(fs.operations).toEqual([]);
    expect(bucket.deleteCalls).toEqual([]);
  });

  it("passes any other listing failure through, a missing permission say", async () => {
    const bucket = {
      ...fakeBucket(seededObjects()),
      getFiles: async () => {
        throw Object.assign(new Error("no storage.objects.list access"), {
          code: 403,
        });
      },
    };
    await expect(
      purgeLegacyFoodPhotos({
        firestore: seededFirestore(),
        bucket,
        fieldDelete: DELETE,
      })
    ).rejects.toThrow("storage.objects.list");
  });
});

describe("parseArgs", () => {
  const base = ["--project", "demo-tropos", "--bucket", BUCKET];

  it("is a dry run unless --apply is given", () => {
    expect(parseArgs(base)).toMatchObject({
      projectId: "demo-tropos",
      bucketName: BUCKET,
      apply: false,
      after: null,
    });
    expect(parseArgs([...base, "--apply"]).apply).toBe(true);
  });

  it("needs the project and the bucket named", () => {
    expect(() => parseArgs(["--bucket", BUCKET])).toThrow(/--project/);
    expect(() => parseArgs(["--project", "demo-tropos"])).toThrow(/--bucket/);
    expect(() =>
      parseArgs([...base.slice(0, 2), "--bucket", "gs://x"])
    ).toThrow(/--bucket/);
  });

  it("resumes only from a meal's path", () => {
    expect(parseArgs([...base, "--after", "users/u1/meals/m1"]).after).toBe(
      "users/u1/meals/m1"
    );
    expect(() => parseArgs([...base, "--after", "users/u1"])).toThrow(
      /--after/
    );
  });

  it("refuses an argument it does not know", () => {
    expect(() => parseArgs([...base, "--force"])).toThrow(/Unknown/);
  });
});

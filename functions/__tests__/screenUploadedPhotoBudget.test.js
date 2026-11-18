/**
 * The upload trigger's screen (screenUploadedPhoto): nothing unscreened
 * stays, and an account's uploads cannot cost Vision without end.
 *
 * Storage limits no account's number of uploads, and every upload to a
 * screened path was one paid Cloud Vision request. When Vision failed, the
 * trigger logged it and kept the file, so a client that skipped the
 * screenPhoto callable kept every photo uploaded meanwhile. Now:
 *   - past the owner's day of screens an upload is deleted unscreened;
 *   - a failed screen throws, so the event is delivered again, and an
 *     upload still unscreened after a day of that is deleted.
 *
 * Run through the real trigger over an in-memory Firestore (the count),
 * a stand-in bucket (the file) and a stubbed fetch (Vision).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("../lib/adminSdk");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { UPLOAD_SCREENS_PER_DAY } = require("../lib/photoScreen");
const { screenUploadedPhoto } = require("../index");

const OWNER = "u1";
const PATH = `space-photos/${OWNER}/1760000000000.jpg`;
const GENERATION = "1760000000000001";

let deleted;
let vision;

function install(db, visionStatus = 200) {
  const real = admin.firestore;
  const firestore = Object.assign(() => db, {
    FieldValue: real.FieldValue,
    Timestamp: real.Timestamp,
  });
  Object.defineProperty(admin, "firestore", {
    configurable: true,
    get: () => firestore,
  });
  Object.defineProperty(admin, "credential", {
    configurable: true,
    get: () => ({
      applicationDefault: () => ({
        getAccessToken: async () => ({ access_token: "token" }),
      }),
    }),
  });
  Object.defineProperty(admin, "storage", {
    configurable: true,
    get: () => () => ({
      bucket: () => ({
        file: (path, options) => ({
          download: async () => [Buffer.from("jpeg bytes")],
          delete: async () => {
            deleted.push({ path, generation: options?.generation });
          },
        }),
      }),
    }),
  });
  vision = vi.fn(async () => ({
    ok: visionStatus < 400,
    status: visionStatus,
    json: async () =>
      visionStatus < 400
        ? { responses: [{ safeSearchAnnotation: { adult: "UNLIKELY" } }] }
        : { error: { code: visionStatus } },
  }));
  vi.stubGlobal("fetch", vision);
}

const upload = { name: PATH, bucket: "bucket", generation: GENERATION };
/** One delivery of an upload's event: the same `eventId` on every retry,
 *  and the time the upload happened. */
const at = (msAgo, eventId = "event-1") => ({
  eventId,
  timestamp: new Date(Date.now() - msAgo).toISOString(),
});
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  deleted = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete admin.firestore;
  delete admin.credential;
  delete admin.storage;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("screenUploadedPhoto", () => {
  it("screens an upload within its owner's day, and keeps one that passes", async () => {
    // Anchor: the budget does not refuse everything.
    install(memoryFirestore({}));
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([]);
  });

  it("deletes an upload past its owner's day of screens, without asking Vision", async () => {
    const now = Date.now();
    install(
      memoryFirestore({
        [`rateLimits/${OWNER}_photoUploadScreenDay`]: {
          timestamps: Array.from(
            { length: UPLOAD_SCREENS_PER_DAY },
            (_, i) => now - i * 60_000
          ),
        },
      })
    );
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([{ path: PATH, generation: GENERATION }]);
  });

  it("counts a day, not for ever", async () => {
    const now = Date.now();
    install(
      memoryFirestore({
        [`rateLimits/${OWNER}_photoUploadScreenDay`]: {
          timestamps: Array.from(
            { length: UPLOAD_SCREENS_PER_DAY },
            (_, i) => now - 25 * HOUR - i * 60_000
          ),
        },
      })
    );
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([]);
  });

  it("is delivered again when Vision fails, and deletes the upload once a day of that has passed", async () => {
    install(memoryFirestore({}), 503);
    // Within the day: thrown, so the platform delivers it again; kept.
    await expect(screenUploadedPhoto.run(upload, at(HOUR))).rejects.toThrow();
    expect(deleted).toEqual([]);
    // A retry past the day: still unscreened, so deleted.
    await screenUploadedPhoto.run(upload, at(25 * HOUR));
    expect(deleted).toEqual([{ path: PATH, generation: GENERATION }]);
  });

  it("counts an upload once however often its event is delivered again", async () => {
    // A Vision outage: each delivery fails and is retried, minutes apart,
    // for a day. Counted each time, one upload's retries spent the day,
    // and the owner's next photo was deleted on arrival.
    install(memoryFirestore({}), 503);
    for (let i = 0; i < UPLOAD_SCREENS_PER_DAY + 1; i++) {
      await expect(
        screenUploadedPhoto.run(upload, at(HOUR, "outage-event"))
      ).rejects.toThrow();
    }
    expect(deleted).toEqual([]);
    expect(vision).toHaveBeenCalledTimes(UPLOAD_SCREENS_PER_DAY + 1);
    // Vision is back: the next upload is screened and kept.
    install(admin.firestore(), 200);
    await screenUploadedPhoto.run(
      { ...upload, name: `space-photos/${OWNER}/next.jpg` },
      at(0, "next-event")
    );
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([]);
  });

  it("is delivered again when the day's count cannot be read, and deletes nothing", async () => {
    const db = memoryFirestore({});
    // The count's commit fails, as a contended transaction does.
    db.failures.set(
      `set:rateLimits/${OWNER}_photoUploadScreenDay`,
      new Error("contention")
    );
    install(db);
    await expect(screenUploadedPhoto.run(upload, at(0))).rejects.toThrow(
      "contention"
    );
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it("leaves alone a path nobody else sees", async () => {
    install(memoryFirestore({}));
    await screenUploadedPhoto.run(
      { ...upload, name: `progress-photos/${OWNER}/a.jpg` },
      at(0)
    );
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });
});

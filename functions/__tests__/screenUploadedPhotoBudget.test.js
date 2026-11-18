/**
 * The upload trigger's screen (screenUploadedPhoto): a person's photo is
 * never deleted because Vision was down or switched off, nothing Vision
 * can never screen stays, and an account's uploads cannot cost Vision
 * without end.
 *
 * Storage limits no account's number of uploads, and every upload to a
 * screened path is one paid Cloud Vision request. So:
 *   - past the owner's day of screens an upload is deleted unscreened,
 *     unless the screenPhoto callable passed that very file;
 *   - an image Vision cannot read (or too large to send) is deleted at
 *     once, with no retry;
 *   - when the service fails, the event is delivered again, and an upload
 *     still unscreened after a day of that is kept and marked unscreened.
 *
 * Run through the real trigger (and, for the callable's pass, the real
 * callable) over an in-memory Firestore (the count), a stand-in bucket
 * (the file) and a stubbed fetch (Vision).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("../lib/adminSdk");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  UPLOAD_SCREENS_PER_DAY,
  VISION_REQUEST_LIMIT_BYTES,
} = require("../lib/photoScreen");
const { screenPhoto, screenUploadedPhoto } = require("../index");

const OWNER = "u1";
const PATH = `space-photos/${OWNER}/1760000000000.jpg`;
const GENERATION = "1760000000000001";
const BUDGET = `rateLimits/${OWNER}_photoUploadScreenDay`;

/** What Vision answers: a fetch response, or a thrown transport error. */
const answer = (status, body) => async () => ({
  ok: status < 400,
  status,
  json: async () => body,
});
const PASSES = answer(200, {
  responses: [{ safeSearchAnnotation: { adult: "UNLIKELY" } }],
});
const vision503 = answer(503, {
  error: {
    code: 503,
    status: "UNAVAILABLE",
    message: "The service is currently unavailable.",
  },
});

let deleted;
let marked;
let vision;
let bytes;

function install(db, visionAnswer = PASSES) {
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
          getMetadata: async () => [{ generation: GENERATION }],
          download: async () => [bytes],
          delete: async () => {
            deleted.push({ path, generation: options?.generation });
          },
          setMetadata: async ({ metadata }) => {
            marked.push({ path, generation: options?.generation, metadata });
          },
        }),
      }),
    }),
  });
  vision = vi.fn(visionAnswer);
  vi.stubGlobal("fetch", vision);
}

/** The owner's day with `n` screens counted in the last hours. */
const spent = (n, extra = {}) => {
  const now = Date.now();
  return {
    [BUDGET]: {
      timestamps: Array.from({ length: n }, (_, i) => now - i * 60_000),
      ...extra,
    },
  };
};

const upload = { name: PATH, bucket: "bucket", generation: GENERATION };
/** One delivery of an upload's event: the same `eventId` on every retry,
 *  and the time the upload happened. */
const at = (msAgo, eventId = "event-1") => ({
  eventId,
  timestamp: new Date(Date.now() - msAgo).toISOString(),
});
const HOUR = 60 * 60 * 1000;
const asOwner = { auth: { uid: OWNER, token: {} } };

beforeEach(() => {
  deleted = [];
  marked = [];
  bytes = Buffer.from("jpeg bytes");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete admin.firestore;
  delete admin.credential;
  delete admin.storage;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("screenUploadedPhoto's day of screens", () => {
  it("screens an upload within its owner's day, and keeps one that passes", async () => {
    // Anchor: the budget does not refuse everything.
    install(memoryFirestore({}));
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([]);
  });

  it("screens the hundredth upload of a day (99 counted), and counts it", async () => {
    const db = memoryFirestore(spent(UPLOAD_SCREENS_PER_DAY - 1));
    install(db);
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([]);
    const snap = await db
      .collection("rateLimits")
      .doc(`${OWNER}_photoUploadScreenDay`)
      .get();
    expect(snap.data().timestamps).toHaveLength(UPLOAD_SCREENS_PER_DAY);
  });

  it("deletes an upload past its owner's day of screens (100 counted), without asking Vision", async () => {
    install(memoryFirestore(spent(UPLOAD_SCREENS_PER_DAY)));
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([{ path: PATH, generation: GENERATION }]);
  });

  it("counts a day, not for ever", async () => {
    const now = Date.now();
    install(
      memoryFirestore({
        [BUDGET]: {
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

  it("counts an upload once however often its event is delivered again", async () => {
    // A Vision outage: each delivery fails and is retried, minutes apart,
    // for a day. Counted each time, one upload's retries would spend the
    // day, and the owner's next photo would be deleted on arrival.
    install(memoryFirestore({}), vision503);
    for (let i = 0; i < UPLOAD_SCREENS_PER_DAY + 1; i++) {
      await expect(
        screenUploadedPhoto.run(upload, at(HOUR, "outage-event"))
      ).rejects.toThrow();
    }
    expect(deleted).toEqual([]);
    expect(vision).toHaveBeenCalledTimes(UPLOAD_SCREENS_PER_DAY + 1);
    // Vision is back: the next upload is screened and kept.
    install(admin.firestore(), PASSES);
    await screenUploadedPhoto.run(
      { ...upload, name: `space-photos/${OWNER}/next.jpg` },
      at(0, "next-event")
    );
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([]);
  });
});

describe("screenUploadedPhoto when the service fails", () => {
  // Each is Google's service, or the transport to it, failing: never the
  // photo's fault, so never grounds to delete it.
  const failures = [
    [
      "a transport error",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "429, quota spent",
      answer(429, {
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded",
        },
      }),
    ],
    ["500", answer(500, { error: { code: 500, status: "INTERNAL" } })],
    ["503", vision503],
    [
      "403, the API switched off",
      answer(403, {
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message:
            "Cloud Vision API has not been used in project 1 before or it is disabled.",
          details: [{ reason: "SERVICE_DISABLED" }],
        },
      }),
    ],
    [
      "403, a permission error",
      answer(403, {
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "The caller does not have permission",
        },
      }),
    ],
    [
      "a per-image UNAVAILABLE",
      answer(200, {
        responses: [{ error: { code: 14, message: "Service unavailable" } }],
      }),
    ],
    [
      "a per-image INTERNAL",
      answer(200, {
        responses: [{ error: { code: 13, message: "Internal error" } }],
      }),
    ],
    ["no annotation", answer(200, { responses: [{}] })],
  ];

  it.each(failures)(
    "%s: delivered again within the day, then kept and marked unscreened, never deleted",
    async (_name, failing) => {
      install(memoryFirestore({}), failing);
      // Within the day: thrown, so the platform delivers it again; kept.
      await expect(screenUploadedPhoto.run(upload, at(HOUR))).rejects.toThrow();
      expect(deleted).toEqual([]);
      expect(marked).toEqual([]);
      // A retry past the day: still unscreened, so kept and marked.
      await screenUploadedPhoto.run(upload, at(25 * HOUR));
      expect(deleted).toEqual([]);
      expect(marked).toEqual([
        {
          path: PATH,
          generation: GENERATION,
          metadata: expect.objectContaining({ screen: "unscreened" }),
        },
      ]);
    }
  );

  it("is delivered again when the day's count cannot be written, and deletes nothing", async () => {
    const db = memoryFirestore({});
    // The count's commit fails, as a contended transaction does.
    db.failures.set(`set:${BUDGET}`, new Error("contention"));
    install(db);
    await expect(screenUploadedPhoto.run(upload, at(0))).rejects.toThrow(
      "contention"
    );
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    // Still failing a day on: kept and marked, not deleted.
    await screenUploadedPhoto.run(upload, at(25 * HOUR));
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(marked).toHaveLength(1);
  });
});

describe("screenUploadedPhoto with a photo Vision can never screen", () => {
  it("deletes an image Vision cannot read at once, on its first delivery, with no retry", async () => {
    install(
      memoryFirestore({}),
      answer(200, {
        responses: [{ error: { code: 3, message: "Bad image data." } }],
      })
    );
    // Resolves, so the platform does not deliver it again.
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([{ path: PATH, generation: GENERATION }]);
    expect(marked).toEqual([]);
  });

  it("deletes a photo too large to send Vision at once, without asking it", async () => {
    // Over Vision's request limit once base64-encoded, as a Space photo
    // under Storage's 10 MB can be; the app's own photos are far smaller.
    bytes = Buffer.alloc(Math.ceil((VISION_REQUEST_LIMIT_BYTES * 3) / 4) + 1);
    install(memoryFirestore({}));
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([{ path: PATH, generation: GENERATION }]);
  });
});

describe("screenUploadedPhoto and a photo the callable passed", () => {
  it("neither screens again nor deletes on budget a file the callable passed", async () => {
    // The trigger's count and the callable's are separate, so without the
    // record the trigger could delete a photo the callable passed and a
    // post already names.
    install(memoryFirestore(spent(UPLOAD_SCREENS_PER_DAY)));
    await expect(screenPhoto.run({ path: PATH }, asOwner)).resolves.toEqual({
      ok: true,
    });
    expect(vision).toHaveBeenCalledTimes(1);
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([]);
  });

  it("still deletes on budget a newer upload at a path the callable passed before", async () => {
    install(
      memoryFirestore(
        spent(UPLOAD_SCREENS_PER_DAY, {
          passed: [{ path: PATH, generation: "1", at: Date.now() - HOUR }],
        })
      )
    );
    await screenUploadedPhoto.run(upload, at(0));
    expect(vision).not.toHaveBeenCalled();
    expect(deleted).toEqual([{ path: PATH, generation: GENERATION }]);
  });

  it("the callable does not pass a file the trigger already dropped on budget", async () => {
    install(memoryFirestore(spent(UPLOAD_SCREENS_PER_DAY)));
    await screenUploadedPhoto.run(upload, at(0));
    expect(deleted).toEqual([{ path: PATH, generation: GENERATION }]);
    // Vision would pass the bytes, but the file is gone: the app must not
    // post it, so the callable answers that the day's checks are spent.
    await expect(
      screenPhoto.run({ path: PATH }, asOwner)
    ).rejects.toMatchObject({
      code: "resource-exhausted",
    });
  });
});

describe("screenUploadedPhoto's paths", () => {
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

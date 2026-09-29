// @vitest-environment jsdom — the upload path draws on a canvas.
/**
 * Progress photos — the model, and the delete, move and upload paths.
 *
 * The rules pinned here are the ones a user sees: which day and pose a
 * photo shows under (older photos included), that nothing is hidden
 * where it cannot be deleted, that a delete takes the file as well as
 * the document, and that a failed save leaves no file behind.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, storage: {} }));

const storageMock = vi.hoisted(() => ({
  deleted: [] as string[],
  uploaded: [] as string[],
  deleteError: null as null | { code: string },
}));
vi.mock("firebase/storage", () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn(async (r: { fullPath: string }) => {
    storageMock.uploaded.push(r.fullPath);
  }),
  deleteObject: vi.fn(async (r: { fullPath: string }) => {
    if (storageMock.deleteError) throw storageMock.deleteError;
    storageMock.deleted.push(r.fullPath);
  }),
  getDownloadURL: vi.fn(async () => "https://example.invalid/blob"),
}));

import {
  checkInPoses,
  defaultComparison,
  deleteProgressPhoto,
  groupByDay,
  isDayKey,
  moveClashes,
  moveProgressPhotos,
  photosOfDay,
  resolvePhotos,
  sharedPoses,
  uploadProgressPhoto,
  type ProgressPhoto,
  type StoredProgressPhoto,
} from "../progressPhotos";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  batchLog,
  failNextFirestore,
} from "@/test/firestoreHarness";

const stored = (
  id: string,
  fields: Partial<StoredProgressPhoto> = {}
): StoredProgressPhoto => ({
  id,
  storagePath: `progress-photos/u1/${id}.enc`,
  iv: [1, 2, 3],
  ...fields,
});

const photo = (
  id: string,
  date: string,
  pose: ProgressPhoto["pose"],
  addedAt = 0
): ProgressPhoto => ({
  id,
  date,
  pose,
  addedAt,
  storagePath: `progress-photos/u1/${id}.enc`,
  iv: [1, 2, 3],
});

beforeEach(() => {
  resetFirestore();
  storageMock.deleted.length = 0;
  storageMock.uploaded.length = 0;
  storageMock.deleteError = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isDayKey", () => {
  it("accepts a real calendar day and nothing else", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-2-8")).toBe(false);
    expect(isDayKey("8 Feb 2026")).toBe(false);
    expect(isDayKey(undefined)).toBe(false);
  });
});

describe("resolvePhotos — which day and pose a photo shows under", () => {
  it("takes the photo's own pose, then its check-in slot, then front", () => {
    const [own, slotted, bare] = resolvePhotos(
      [
        stored("own", { date: "2026-07-01", pose: "back" }),
        stored("slotted", { date: "2026-07-01" }),
        stored("bare", { date: "2026-07-01" }),
      ],
      checkInPoses([{ photoIds: { own: "x", side: "slotted" } }])
    );
    expect(own.pose).toBe("back");
    expect(slotted.pose).toBe("side");
    expect(bare.pose).toBe("front");
  });

  it("a photo's own pose wins over the check-in that once filed it", () => {
    const [p] = resolvePhotos(
      [stored("p", { date: "2026-07-01", pose: "front" })],
      checkInPoses([{ photoIds: { back: "p" } }])
    );
    expect(p.pose).toBe("front");
  });

  it("a photo without a usable day takes the day it was added", () => {
    const added = new Date(2026, 6, 4, 9, 30).getTime();
    const [p] = resolvePhotos(
      [stored("p", { date: "July 4", createdAt: added })],
      new Map()
    );
    expect(p.date).toBe("2026-07-04");
    expect(p.addedAt).toBe(added);
  });

  it("leaves out only what has nowhere to show", () => {
    const photos = resolvePhotos(
      [
        stored("no-day", {}),
        { id: "no-file", iv: [1], date: "2026-07-01" } as never,
        stored("ok", { date: "2026-07-01" }),
      ],
      new Map()
    );
    expect(photos.map((p) => p.id)).toEqual(["ok"]);
  });
});

describe("checkInPoses", () => {
  it("the first check-in to name a photo wins, and junk is ignored", () => {
    const poses = checkInPoses([
      { photoIds: { front: "a", side: 7, knee: "b" } },
      { photoIds: { back: "a", side: "c" } },
      { photoIds: null },
      {},
    ]);
    expect([...poses]).toEqual([
      ["a", "front"],
      ["c", "side"],
    ]);
  });
});

describe("groupByDay", () => {
  it("newest day first, the newest photo of each pose on show, nothing hidden", () => {
    const days = groupByDay([
      photo("old-front", "2026-07-01", "front", 100),
      photo("new-front", "2026-07-01", "front", 200),
      photo("side", "2026-07-01", "side", 150),
      photo("later", "2026-08-01", "back", 50),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-08-01", "2026-07-01"]);
    const july = days[1];
    expect(july.byPose.front?.id).toBe("new-front");
    expect(july.byPose.side?.id).toBe("side");
    // The second front photo stays on the day, where it can be deleted.
    expect(july.extras.map((p) => p.id)).toEqual(["old-front"]);
    expect(photosOfDay(july).map((p) => p.id)).toEqual([
      "new-front",
      "side",
      "old-front",
    ]);
  });
});

describe("Compare", () => {
  const days = groupByDay([
    photo("a-front", "2026-06-01", "front"),
    photo("a-side", "2026-06-01", "side"),
    photo("b-front", "2026-07-01", "front"),
    photo("c-front", "2026-08-01", "front"),
    photo("c-side", "2026-08-01", "side"),
    photo("c-back", "2026-08-01", "back"),
  ]);

  it("opens on the first day and the latest", () => {
    expect(defaultComparison(days)).toEqual({
      before: "2026-06-01",
      after: "2026-08-01",
    });
    expect(defaultComparison(days.slice(0, 1))).toBeNull();
  });

  it("offers the poses both days have, in order", () => {
    const [aug, jul, jun] = days;
    expect(sharedPoses(jun, aug)).toEqual(["front", "side"]);
    expect(sharedPoses(jul, aug)).toEqual(["front"]);
  });
});

describe("moveClashes", () => {
  const days = groupByDay([
    photo("a-front", "2026-06-01", "front"),
    photo("b-front", "2026-07-01", "front"),
    photo("b-side", "2026-07-01", "side"),
    photo("c-back", "2026-08-01", "back"),
  ]);

  it("names each pose the target day already has", () => {
    expect(moveClashes(days, "2026-07-01", "2026-06-01")).toEqual(["front"]);
  });

  it("is clean onto a day without those poses, an empty day, or itself", () => {
    expect(moveClashes(days, "2026-06-01", "2026-08-01")).toEqual([]);
    expect(moveClashes(days, "2026-06-01", "2026-09-01")).toEqual([]);
    expect(moveClashes(days, "2026-06-01", "2026-06-01")).toEqual([]);
  });
});

describe("deleteProgressPhoto", () => {
  const target = photo("p1", "2026-07-01", "front");

  beforeEach(() => {
    seedFirestore({
      "users/u1/progressPhotos/p1": { date: "2026-07-01", pose: "front" },
    });
  });

  it("deletes the file, then the document", async () => {
    await deleteProgressPhoto("u1", target);
    expect(storageMock.deleted).toEqual(["progress-photos/u1/p1.enc"]);
    expect(readDoc("users/u1/progressPhotos/p1")).toBeUndefined();
  });

  it("a file already gone still takes the document with it", async () => {
    storageMock.deleteError = { code: "storage/object-not-found" };
    await deleteProgressPhoto("u1", target);
    expect(readDoc("users/u1/progressPhotos/p1")).toBeUndefined();
  });

  it("any other file failure keeps the document, so the photo can be retried", async () => {
    storageMock.deleteError = { code: "storage/retry-limit-exceeded" };
    await expect(deleteProgressPhoto("u1", target)).rejects.toEqual({
      code: "storage/retry-limit-exceeded",
    });
    expect(readDoc("users/u1/progressPhotos/p1")).toBeDefined();
  });

  it("refuses a file outside the account's folder", async () => {
    await expect(
      deleteProgressPhoto("u1", {
        id: "p1",
        storagePath: "progress-photos/u2/p1.enc",
      })
    ).rejects.toThrow(/does not belong/);
    expect(storageMock.deleted).toEqual([]);
    expect(readDoc("users/u1/progressPhotos/p1")).toBeDefined();
  });
});

describe("moveProgressPhotos", () => {
  it("moves every photo in one write, each keeping its pose", async () => {
    seedFirestore({
      "users/u1/progressPhotos/a": { date: "2026-07-01" },
      "users/u1/progressPhotos/b": { date: "2026-07-01", pose: "side" },
    });
    await moveProgressPhotos(
      "u1",
      [photo("a", "2026-07-01", "front"), photo("b", "2026-07-01", "side")],
      "2026-06-20"
    );
    expect(batchLog()).toHaveLength(1);
    expect(readDoc("users/u1/progressPhotos/a")).toMatchObject({
      date: "2026-06-20",
      pose: "front",
    });
    expect(readDoc("users/u1/progressPhotos/b")).toMatchObject({
      date: "2026-06-20",
      pose: "side",
    });
  });

  it("refuses a day that is not a real date", async () => {
    await expect(
      moveProgressPhotos("u1", [photo("a", "2026-07-01", "front")], "20 June")
    ).rejects.toThrow(/valid date/);
  });
});

describe("uploadProgressPhoto", () => {
  function prepareImage() {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 16, height: 16 }))
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) =>
        callback(new Blob(["compressed image"], { type: "image/webp" }))
    );
  }
  const file = () => new File(["source"], "p.jpg", { type: "image/jpeg" });

  it("saves the day and pose on the photo", async () => {
    prepareImage();
    const { photo: saved } = await uploadProgressPhoto("u1", file(), {
      date: "2026-06-20",
      pose: "side",
    });
    expect(saved).toMatchObject({ date: "2026-06-20", pose: "side" });
    expect(readDoc(`users/u1/progressPhotos/${saved.id}`)).toMatchObject({
      date: "2026-06-20",
      pose: "side",
      visibility: "private",
      encryptionVersion: 2,
    });
  });

  it("a document that fails to save takes its uploaded file with it", async () => {
    prepareImage();
    failNextFirestore("addDoc", { code: "permission-denied" });
    await expect(
      uploadProgressPhoto("u1", file(), { date: "2026-06-20", pose: "front" })
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(storageMock.uploaded).toHaveLength(1);
    expect(storageMock.deleted).toEqual(storageMock.uploaded);
  });

  it("refuses a day that is not a real date before uploading anything", async () => {
    prepareImage();
    await expect(
      uploadProgressPhoto("u1", file(), { date: "2026-06-31", pose: "front" })
    ).rejects.toThrow(/valid date/);
    expect(storageMock.uploaded).toEqual([]);
  });
});

// @vitest-environment jsdom — the save path decodes through <img> + canvas.
/**
 * Food9 — food photos live on the phone, not on a server.
 *
 * Two halves, tested differently on purpose:
 *
 *   1. The RULE (`selectEvictions`, the filename codec) is pure, so it
 *      is tested against literals. No mock can make it pass for the
 *      wrong reason.
 *   2. The IO runs against an in-memory fake of `@capacitor/filesystem`
 *      that behaves like the real one where the real one's behaviour
 *      matters — notably `readdir` THROWING for a directory that does
 *      not exist, which is the everyday state of an account that has
 *      never captured, not an error.
 *
 * Expected values are written as literals rather than recomputed by the
 * code under test: an expectation derived from the implementation pins
 * consistency, not behaviour.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── Fake device filesystem ───────────────────────────────────────── */

interface FakeFile {
  data: string;
  size: number;
  type: "file" | "directory";
}
const files = new Map<string, FakeFile>();
const key = (directory: string, path: string) => `${directory}::${path}`;

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Library: "LIBRARY", Cache: "CACHE" },
  Filesystem: {
    writeFile: vi.fn(
      async (o: { path: string; data: string; directory: string }) => {
        files.set(key(o.directory, o.path), {
          data: o.data,
          size: o.data.length,
          type: "file",
        });
        return { uri: `file:///${o.directory}/${o.path}` };
      }
    ),
    readdir: vi.fn(async (o: { path: string; directory: string }) => {
      const prefix = `${o.path}/`;
      const out: { name: string; type: string; size: number }[] = [];
      for (const [k, v] of files) {
        const [dir, p] = k.split("::");
        if (dir !== o.directory || !p.startsWith(prefix)) continue;
        out.push({ name: p.slice(prefix.length), type: v.type, size: v.size });
      }
      // The real web shim throws for a folder that was never created.
      // An account that has never captured lives in exactly this state.
      if (out.length === 0) throw new Error("Folder does not exist.");
      return { files: out };
    }),
    readFile: vi.fn(async (o: { path: string; directory: string }) => {
      const f = files.get(key(o.directory, o.path));
      if (!f) throw new Error("File does not exist.");
      return { data: f.data };
    }),
    deleteFile: vi.fn(async (o: { path: string; directory: string }) => {
      if (!files.delete(key(o.directory, o.path)))
        throw new Error("File does not exist.");
    }),
    getUri: vi.fn(async (o: { path: string; directory: string }) => ({
      uri: `file:///${o.directory}/${o.path}`,
    })),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { convertFileSrc: (uri: string) => `capacitor-asset:${uri}` },
}));

const isNative = vi.fn(() => false);
vi.mock("../platform", () => ({ isNativePlatform: () => isNative() }));

import {
  photoFileName,
  parsePhotoFileName,
  selectEvictions,
  saveFoodPhoto,
  listFoodPhotos,
  resolveFoodPhotoSrcs,
  evictFoodPhotos,
  deleteAllFoodPhotos,
  subscribeFoodPhotos,
  RETENTION_DAYS,
  type StoredFoodPhoto,
} from "../foodPhotoStore";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 20, 12, 0, 0);

function seed(uid: string, mealId: string, capturedAtMs: number, size: number) {
  const name = photoFileName(mealId, capturedAtMs);
  files.set(key("LIBRARY", `food-photos/${uid}/${name}`), {
    data: "x".repeat(size),
    size,
    type: "file",
  });
  return name;
}

function photo(mealId: string, ageDays: number, size: number): StoredFoodPhoto {
  const capturedAtMs = NOW - ageDays * DAY;
  return {
    name: photoFileName(mealId, capturedAtMs),
    mealId,
    capturedAtMs,
    size,
  };
}

/* Stub the decode pipeline: jsdom ships no canvas backend, so the real
   <img> + canvas downscale cannot run here. The RESIZE is therefore the
   one claim this suite does not make (it needs a real browser); what is
   pinned is everything around it — the path, the uid scoping, the
   filename, and the notification. */
function stubImagePipeline(): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 1920;
    naturalHeight = 1080;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas")
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => "data:image/jpeg;base64,ZmFrZQ==",
    };
  }) as typeof document.createElement);
}

beforeEach(() => {
  files.clear();
  isNative.mockReturnValue(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ── The filename codec ───────────────────────────────────────────── */

describe("photo filename codec", () => {
  it("round-trips a meal id that itself contains dashes", () => {
    // Firestore auto-ids are [A-Za-z0-9] today, but nothing in the data
    // model promises that, and splitting on the LAST dash instead of the
    // first would silently truncate such an id.
    const name = photoFileName("abc-def-123", 1_700_000_000_000);
    expect(name).toBe("1700000000000-abc-def-123.jpg");
    expect(parsePhotoFileName(name)).toEqual({
      mealId: "abc-def-123",
      capturedAtMs: 1_700_000_000_000,
    });
  });

  it.each([
    ["a file that is not ours", "notes.txt"],
    ["a jpg with no timestamp", "-abc.jpg"],
    ["a jpg with no meal id", "1700000000000-.jpg"],
    ["a non-numeric timestamp", "when-abc.jpg"],
    ["no separator at all", "1700000000000.jpg"],
  ])("rejects %s", (_label, name) => {
    expect(parsePhotoFileName(name)).toBeNull();
  });
});

/* ── The retention rule ───────────────────────────────────────────── */

describe("selectEvictions — the age rule", () => {
  it("evicts a photo older than the retention window", () => {
    const old = photo("old", RETENTION_DAYS + 1, 1000);
    const fresh = photo("fresh", 1, 1000);
    expect(selectEvictions([old, fresh], NOW).map((p) => p.mealId)).toEqual([
      "old",
    ]);
  });

  it("keeps a photo sitting exactly on the boundary", () => {
    // 90 days is the promise. A photo that is exactly 90 days old has
    // not yet outlived it — a `>=` here would quietly make the rule 89.
    const boundary = photo("boundary", RETENTION_DAYS, 1000);
    expect(selectEvictions([boundary], NOW)).toEqual([]);
  });

  it("keeps everything inside the window and under budget", () => {
    const photos = [photo("a", 1, 10), photo("b", 30, 10), photo("c", 89, 10)];
    expect(selectEvictions(photos, NOW)).toEqual([]);
  });
});

describe("selectEvictions — the byte budget", () => {
  it("evicts oldest-first once the directory exceeds the budget", () => {
    // Four fresh photos of 40 bytes against a 100-byte budget: the two
    // newest fit (80), the third crosses it. Both older ones go.
    const photos = [
      photo("d1", 1, 40),
      photo("d2", 2, 40),
      photo("d3", 3, 40),
      photo("d4", 4, 40),
    ];
    const evicted = selectEvictions(photos, NOW, { byteBudget: 100 });
    expect(evicted.map((p) => p.mealId).sort()).toEqual(["d3", "d4"]);
  });

  it("is a backstop, not the everyday rule — a real user never reaches it", () => {
    // Two captures a day for the full window at ~250 KB each is ~44 MB,
    // comfortably inside the 250 MB budget. If this ever fails, the
    // budget is firing for an ordinary user and the AGE rule is wrong.
    const photos = Array.from({ length: RETENTION_DAYS * 2 }, (_, i) =>
      photo(`m${i}`, i / 2, 250 * 1024)
    );
    expect(selectEvictions(photos, NOW)).toEqual([]);
  });

  it("never punches a hole — evictions are a contiguous oldest suffix", () => {
    // The property a user actually experiences: scrolling back, photos
    // stop at some point. They never find a gap between two survivors.
    const photos = [
      photo("a", 1, 60),
      photo("b", 2, 60),
      photo("c", 3, 60),
      photo("d", RETENTION_DAYS + 5, 60),
    ];
    const evictedIds = new Set(
      selectEvictions(photos, NOW, { byteBudget: 150 }).map((p) => p.mealId)
    );
    const newestFirst = [...photos].sort(
      (x, y) => y.capturedAtMs - x.capturedAtMs
    );
    const kept = newestFirst.filter((p) => !evictedIds.has(p.mealId));
    const gone = newestFirst.filter((p) => evictedIds.has(p.mealId));
    expect(newestFirst).toEqual([...kept, ...gone]);
    expect(gone.length).toBeGreaterThan(0);
  });
});

/* ── Device IO ────────────────────────────────────────────────────── */

describe("listFoodPhotos", () => {
  it("reports an empty device rather than throwing when nothing was ever captured", async () => {
    await expect(listFoodPhotos("u1")).resolves.toEqual([]);
  });

  it("reads back what was written, with sizes", async () => {
    seed("u1", "meal-a", NOW - DAY, 1234);
    const listed = await listFoodPhotos("u1");
    expect(listed).toEqual([
      {
        name: `${NOW - DAY}-meal-a.jpg`,
        mealId: "meal-a",
        capturedAtMs: NOW - DAY,
        size: 1234,
      },
    ]);
  });

  it("ignores files it did not write", async () => {
    seed("u1", "meal-a", NOW - DAY, 10);
    files.set(key("LIBRARY", "food-photos/u1/README.txt"), {
      data: "",
      size: 0,
      type: "file",
    });
    const listed = await listFoodPhotos("u1");
    expect(listed.map((p) => p.mealId)).toEqual(["meal-a"]);
  });

  it("does not see another account's photos on a shared device", async () => {
    seed("alice", "meal-a", NOW - DAY, 10);
    seed("bob", "meal-b", NOW - DAY, 10);
    expect((await listFoodPhotos("alice")).map((p) => p.mealId)).toEqual([
      "meal-a",
    ]);
    expect((await listFoodPhotos("bob")).map((p) => p.mealId)).toEqual([
      "meal-b",
    ]);
  });
});

describe("resolveFoodPhotoSrcs", () => {
  it("returns srcs only for the meals asked about", async () => {
    seed("u1", "wanted", NOW - DAY, 4);
    seed("u1", "other", NOW - DAY, 4);
    const srcs = await resolveFoodPhotoSrcs("u1", ["wanted", "absent"]);
    expect(Object.keys(srcs)).toEqual(["wanted"]);
  });

  it("omits a meal with no photo on this device — the row stays text", async () => {
    seed("u1", "has-photo", NOW - DAY, 4);
    const srcs = await resolveFoodPhotoSrcs("u1", ["has-photo", "text-log"]);
    expect(srcs["text-log"]).toBeUndefined();
    expect(srcs["has-photo"]).toBeTruthy();
  });

  it("hands the web a data URL", async () => {
    isNative.mockReturnValue(false);
    seed("u1", "m", NOW - DAY, 4);
    const srcs = await resolveFoodPhotoSrcs("u1", ["m"]);
    expect(srcs.m).toBe("data:image/jpeg;base64,xxxx");
  });

  it("hands the native shell a file src, never a data URL", async () => {
    // Pulling a quarter-megabyte through a data URL per row is the thing
    // convertFileSrc exists to avoid on device.
    isNative.mockReturnValue(true);
    seed("u1", "m", NOW - DAY, 4);
    const srcs = await resolveFoodPhotoSrcs("u1", ["m"]);
    expect(srcs.m).toBe(
      `capacitor-asset:file:///LIBRARY/food-photos/u1/${NOW - DAY}-m.jpg`
    );
  });
});

describe("evictFoodPhotos", () => {
  it("deletes the aged photos and leaves the rest on disk", async () => {
    seed("u1", "keep", NOW - DAY, 10);
    seed("u1", "drop", NOW - (RETENTION_DAYS + 3) * DAY, 10);
    const result = await evictFoodPhotos("u1", NOW);
    expect(result).toEqual({ removed: 1, remaining: 1 });
    expect((await listFoodPhotos("u1")).map((p) => p.mealId)).toEqual(["keep"]);
  });

  it("is a no-op on a device with nothing to evict", async () => {
    seed("u1", "keep", NOW - DAY, 10);
    expect(await evictFoodPhotos("u1", NOW)).toEqual({
      removed: 0,
      remaining: 1,
    });
  });

  it("sweeps only the account it was given", async () => {
    seed("alice", "a-old", NOW - (RETENTION_DAYS + 3) * DAY, 10);
    seed("bob", "b-old", NOW - (RETENTION_DAYS + 3) * DAY, 10);
    await evictFoodPhotos("alice", NOW);
    expect((await listFoodPhotos("bob")).map((p) => p.mealId)).toEqual([
      "b-old",
    ]);
  });
});

describe("deleteAllFoodPhotos", () => {
  it("clears this account and only this account", async () => {
    seed("alice", "a1", NOW - DAY, 10);
    seed("alice", "a2", NOW - DAY, 10);
    seed("bob", "b1", NOW - DAY, 10);
    expect(await deleteAllFoodPhotos("alice")).toBe(2);
    expect(await listFoodPhotos("alice")).toEqual([]);
    expect((await listFoodPhotos("bob")).map((p) => p.mealId)).toEqual(["b1"]);
  });
});

describe("saveFoodPhoto", () => {
  beforeEach(stubImagePipeline);

  it("writes under the account's own directory, keyed by meal id", async () => {
    expect(await saveFoodPhoto("u1", "meal-x", "ZmFrZQ==", NOW)).toBe(true);
    expect(files.has(key("LIBRARY", `food-photos/u1/${NOW}-meal-x.jpg`))).toBe(
      true
    );
  });

  it("tells the diary a photo landed", async () => {
    // No Firestore field changes when a capture is saved, so nothing in
    // the snapshot stream would announce it. Without this the card
    // appears late, or not until something unrelated re-renders.
    const listener = vi.fn();
    const unsubscribe = subscribeFoodPhotos(listener);
    await saveFoodPhoto("u1", "meal-x", "ZmFrZQ==", NOW);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await saveFoodPhoto("u1", "meal-y", "ZmFrZQ==", NOW);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("refuses a save with no meal to key it to", async () => {
    expect(await saveFoodPhoto("u1", "", "ZmFrZQ==", NOW)).toBe(false);
    expect(await saveFoodPhoto("", "meal-x", "ZmFrZQ==", NOW)).toBe(false);
  });

  it("resolves false rather than throwing when the photo will not decode", async () => {
    // The meal is already logged by this point — a decode failure must
    // leave a text row, never surface an error over a saved meal.
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", BrokenImage);
    expect(await saveFoodPhoto("u1", "meal-x", "not-a-jpeg", NOW)).toBe(false);
    expect(files.size).toBe(0);
  });
});

/**
 * foodPhotoStore — device-local meal photos (Food9).
 *
 * The module this replaces (`foodPhotoUpload.ts`) had NO test file at
 * all, and the one suite that imported it mocked it with zero
 * assertions. So the entire client photo path shipped unguarded in both
 * directions. This is the guard.
 *
 * Weight is on `planEviction`, because it is the only code here that can
 * destroy a user's data, and because the way it would go wrong is silent:
 * a rule phrased as "delete blobs whose meal is not currently loaded"
 * looks correct and deletes live photos for exactly the heavy users the
 * feature exists for (`useMeals` paginates). It is pure, so the whole
 * retention policy is testable with no device and no Capacitor.
 *
 * `toStorableJpeg` / `saveFoodPhoto` are deliberately NOT exercised here:
 * they need `<img>` + canvas, which jsdom does not implement, so a test
 * of them would be a test of a stub wearing the name of a real thing.
 * The downscale is called out as device-only in the QA backlog — same
 * status it had under the Storage implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** In-memory stand-in for the plugin, shaped like the parts we call. */
const files = new Map<string, { data: string; mtime: number; size: number }>();

vi.mock("@capacitor/filesystem", () => ({
  Directory: { LibraryNoCloud: "LIBRARY_NO_CLOUD" },
  Filesystem: {
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      files.set(path, { data, mtime: Date.now(), size: data.length });
      return { uri: path };
    }),
    readFile: vi.fn(async ({ path }: { path: string }) => {
      const f = files.get(path);
      if (!f) throw new Error("File does not exist.");
      return { data: f.data };
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => {
      if (!files.has(path)) throw new Error("File does not exist.");
      files.delete(path);
    }),
    readdir: vi.fn(async ({ path }: { path: string }) => {
      const prefix = `${path}/`;
      const out = [...files.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ({
          name: k.slice(prefix.length),
          type: "file" as const,
          size: v.size,
          mtime: v.mtime,
          uri: k,
        }));
      if (!out.length) throw new Error("Directory does not exist.");
      return { files: out };
    }),
    rmdir: vi.fn(async ({ path }: { path: string }) => {
      for (const k of [...files.keys()]) {
        if (k.startsWith(`${path}/`)) files.delete(k);
      }
    }),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import {
  MAX_AGE_DAYS,
  MAX_TOTAL_BYTES,
  deleteFoodPhoto,
  listFoodPhotos,
  mealIdFromFileName,
  planEviction,
  purgeFoodPhotos,
  readFoodPhotoSrc,
  sweepFoodPhotos,
  sweepFoodPhotosOnce,
  type StoredPhoto,
} from "../foodPhotoStore";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function photo(
  mealId: string,
  ageDays: number,
  bytes = 250 * 1024
): StoredPhoto {
  return { mealId, mtime: NOW - ageDays * DAY, bytes };
}

/** Write straight into the fake, bypassing the canvas-dependent encode. */
async function seed(uid: string, mealId: string, ageDays: number, size = 1000) {
  files.set(`food-photos/${uid}/${mealId}.jpg`, {
    data: "QUJD",
    mtime: NOW - ageDays * DAY,
    size,
  });
}

beforeEach(() => {
  files.clear();
  // `sweepFoodPhotos` reads the real clock; the fixtures are dated
  // relative to NOW, so the two have to agree or every age assertion is
  // measuring the gap between them instead of the policy.
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("planEviction — the age cap", () => {
  it("keeps everything inside the window", () => {
    const doomed = planEviction([photo("a", 1), photo("b", 89)], { now: NOW });
    expect(doomed).toEqual([]);
  });

  it("drops anything past the window", () => {
    const doomed = planEviction([photo("a", 1), photo("old", 91)], {
      now: NOW,
    });
    expect(doomed).toEqual(["old"]);
  });

  it("is inclusive at the boundary — exactly 90 days old survives", () => {
    // mtime === cutoff, not <. A photo taken 90 days ago to the
    // millisecond is still the oldest day the diary can navigate to.
    const doomed = planEviction([photo("edge", MAX_AGE_DAYS)], { now: NOW });
    expect(doomed).toEqual([]);
  });
});

describe("planEviction — the byte backstop", () => {
  it("does not fire for a realistic load", () => {
    // 2 saved photos/day for the whole window, at the measured upper end
    // of a 1280px q0.8 capture. ~70 MB — nowhere near the budget.
    const photos = Array.from({ length: 180 }, (_, i) =>
      photo(`m${i}`, i / 2, 400 * 1024)
    );
    expect(planEviction(photos, { now: NOW })).toEqual([]);
  });

  it("evicts oldest-first until the total fits", () => {
    const photos = [
      photo("newest", 1, 60),
      photo("middle", 2, 60),
      photo("oldest", 3, 60),
    ];
    const doomed = planEviction(photos, { now: NOW, maxTotalBytes: 120 });
    expect(doomed).toEqual(["oldest"]);
  });

  it("keeps evicting while still over budget", () => {
    const photos = [
      photo("newest", 1, 60),
      photo("middle", 2, 60),
      photo("oldest", 3, 60),
    ];
    const doomed = planEviction(photos, { now: NOW, maxTotalBytes: 60 });
    expect(new Set(doomed)).toEqual(new Set(["oldest", "middle"]));
  });

  it("never evicts the newest photo to satisfy the budget alone", () => {
    // A user who just scanned must see that scan. Even a budget smaller
    // than one photo leaves the last survivor standing, because the loop
    // stops when the list is exhausted rather than emptying it.
    const doomed = planEviction([photo("only", 0, 999)], {
      now: NOW,
      maxTotalBytes: 1,
    });
    expect(doomed).toEqual([]);
  });

  it("counts age-evicted photos as already freed", () => {
    // The expired one must not also be charged against the budget, or a
    // live photo gets evicted to make room for bytes that are going away.
    const photos = [photo("fresh", 1, 100), photo("expired", 200, 10_000)];
    const doomed = planEviction(photos, { now: NOW, maxTotalBytes: 100 });
    expect(doomed).toEqual(["expired"]);
  });
});

describe("planEviction — orphans are positive evidence only", () => {
  it("drops a meal id explicitly named as orphaned", () => {
    const doomed = planEviction([photo("gone", 1), photo("here", 1)], {
      now: NOW,
      orphanedMealIds: new Set(["gone"]),
    });
    expect(doomed).toEqual(["gone"]);
  });

  it("keeps every photo when NO orphan set is supplied", () => {
    // The load-bearing negative. `useMeals` paginates: absence from the
    // loaded page means "not on this page", never "deleted". If this ever
    // inverts, a heavy user loses live photos silently.
    const doomed = planEviction([photo("a", 1), photo("b", 2)], { now: NOW });
    expect(doomed).toEqual([]);
  });

  it("keeps a photo whose meal id is merely absent from the orphan set", () => {
    const doomed = planEviction([photo("unknown", 1)], {
      now: NOW,
      orphanedMealIds: new Set(["somethingElse"]),
    });
    expect(doomed).toEqual([]);
  });

  it("does not double-report a photo that is both orphaned and expired", () => {
    const doomed = planEviction([photo("both", 200)], {
      now: NOW,
      orphanedMealIds: new Set(["both"]),
    });
    expect(doomed).toEqual(["both"]);
  });
});

describe("retention window tracks the diary window", () => {
  it("MAX_AGE_DAYS equals Food.tsx's FOOD_TAP_BACK_DAYS", async () => {
    /* Not a coincidence to be preserved by memory: the photo is only
       ever rendered by the diary row, and the diary cannot navigate
       further back than FOOD_TAP_BACK_DAYS, so a photo older than that
       is unreachable in the only surface that could show it. Two
       literals a repo apart; this is the pin that makes them one
       decision. Widen the tap-back and this fails until the retention
       window moves with it. */
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../pages/Food.tsx"), "utf8");
    const match = source.match(/FOOD_TAP_BACK_DAYS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(MAX_AGE_DAYS);
  });

  it("the byte backstop is above a full window of realistic use", () => {
    // 90 days x 3 saved photos/day x 400 KB pessimistic ~= 105 MB. The
    // budget must clear that comfortably or it becomes the binding rule
    // and starts deleting photos users can still navigate to.
    expect(MAX_TOTAL_BYTES).toBeGreaterThan(MAX_AGE_DAYS * 3 * 400 * 1024);
  });
});

describe("mealIdFromFileName", () => {
  it("reads the meal id back out", () => {
    expect(mealIdFromFileName("abc123.jpg")).toBe("abc123");
  });

  it("tolerates dots in a meal id", () => {
    expect(mealIdFromFileName("a.b.c.jpg")).toBe("a.b.c");
  });

  it("ignores anything that is not one of ours", () => {
    expect(mealIdFromFileName("notes.txt")).toBeNull();
    expect(mealIdFromFileName(".jpg")).toBeNull();
  });
});

describe("store round-trip", () => {
  it("reads a stored photo back as a data URL", async () => {
    await seed("u1", "m1", 0);
    expect(await readFoodPhotoSrc("u1", "m1")).toBe(
      "data:image/jpeg;base64,QUJD"
    );
  });

  it("returns null for a meal with no photo instead of throwing", async () => {
    expect(await readFoodPhotoSrc("u1", "nope")).toBeNull();
  });

  it("lists photos with their age and size", async () => {
    await seed("u1", "m1", 3, 111);
    const listed = await listFoodPhotos("u1");
    expect(listed).toEqual([
      { mealId: "m1", mtime: NOW - 3 * DAY, bytes: 111 },
    ]);
  });

  it("returns an empty list for a user who has never scanned", async () => {
    // readdir THROWS on a missing directory — the state every new user is
    // in. If that escaped, the diary would fail to render rather than
    // simply showing text rows.
    expect(await listFoodPhotos("never-scanned")).toEqual([]);
  });

  it("deleting a photo that is already gone is not an error", async () => {
    await expect(deleteFoodPhoto("u1", "absent")).resolves.toBeUndefined();
  });
});

describe("uid isolation", () => {
  it("one user's photos are invisible to another", async () => {
    await seed("alice", "m1", 0);
    await seed("bob", "m2", 0);
    expect((await listFoodPhotos("alice")).map((p) => p.mealId)).toEqual([
      "m1",
    ]);
    expect(await readFoodPhotoSrc("bob", "m1")).toBeNull();
  });

  it("purging one account leaves the other's photos alone", async () => {
    // The shared-device case. Same posture as offlineQueue: the uid
    // segment IS the isolation, so signing out never wipes.
    await seed("alice", "m1", 0);
    await seed("bob", "m2", 0);
    await purgeFoodPhotos("alice");
    expect(await listFoodPhotos("alice")).toEqual([]);
    expect((await listFoodPhotos("bob")).map((p) => p.mealId)).toEqual(["m2"]);
  });

  it("sweeping one account never touches another's expired photos", async () => {
    await seed("alice", "old", 200);
    await seed("bob", "old", 200);
    await sweepFoodPhotos("alice");
    expect(await listFoodPhotos("alice")).toEqual([]);
    expect(await listFoodPhotos("bob")).toHaveLength(1);
  });
});

describe("sweepFoodPhotos", () => {
  it("removes expired photos and keeps fresh ones", async () => {
    await seed("u1", "fresh", 2);
    await seed("u1", "stale", 120);
    const dropped = await sweepFoodPhotos("u1");
    expect(dropped).toBe(1);
    expect((await listFoodPhotos("u1")).map((p) => p.mealId)).toEqual([
      "fresh",
    ]);
  });

  it("is a no-op for a user with no photos", async () => {
    expect(await sweepFoodPhotos("nobody")).toBe(0);
  });
});

describe("sweepFoodPhotosOnce", () => {
  it("runs the sweep the first time and skips it afterwards", async () => {
    /* A uid unique to this test: the guard is module-level and keyed by
       uid, with no reset seam (see the note in foodPhotoStore.ts), so
       isolation comes from the key rather than from reaching in. */
    const uid = "sweep-once-subject";
    await seed(uid, "stale", 120);
    await sweepFoodPhotosOnce(uid);
    expect(await listFoodPhotos(uid)).toEqual([]);

    // A second expired photo appearing later in the same session is NOT
    // swept again — the guard is per session, and the next launch picks
    // it up. Pinning this stops a future "just call it on every mount".
    await seed(uid, "stale2", 120);
    await sweepFoodPhotosOnce(uid);
    expect(await listFoodPhotos(uid)).toHaveLength(1);
  });

  it("does nothing without a uid", async () => {
    await expect(sweepFoodPhotosOnce("")).resolves.toBeUndefined();
  });
});

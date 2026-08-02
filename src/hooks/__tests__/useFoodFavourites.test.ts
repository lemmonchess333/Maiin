import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  seedFirestore,
  resetFirestore,
  writeLog,
  readDoc,
  flushSnapshots,
} from "@/test/firestoreHarness";

// The `user` identity must be STABLE across renders. `useFoodFavourites`
// has TWO effects keyed on it (`[user]` and `[favourites, isOnline,
// user]`), so a fresh object literal per render re-subscribes on every
// render — and since the fake delivers a fresh `data()` object per fire,
// that setState re-renders, which re-subscribes... a runaway loop that
// hangs the worker. The old stub hid it by never firing spontaneously.
// Same bug as `useEffectiveTargets` (#1801); the real `useAuth` returns
// a stable user from context.
const AUTH = vi.hoisted(() => ({ user: { uid: "me" } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => AUTH,
  useUid: () => AUTH.user?.uid ?? null,
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const onlineState = { isOnline: true };
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => onlineState,
}));

const trackedEvents: Array<{
  event: string;
  metadata: Record<string, unknown>;
}> = [];
vi.mock("@/lib/foodAnalytics", () => ({
  track: vi.fn((event: string, metadata: Record<string, unknown>) => {
    trackedEvents.push({ event, metadata });
  }),
}));

/**
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 *
 * It hand-rolled a `FakeTimestamp` class and an `INCREMENT_SENTINEL`
 * symbol — both of which the shared fake already exports — plus capture
 * arrays for setDoc/deleteDoc. Favourites are now real documents under
 * `users/me/foodFavourites`, so `increment()` actually accumulates
 * against stored state instead of being asserted as an opaque token.
 */
vi.mock("firebase/firestore");

import { useFoodFavourites } from "@/hooks/useFoodFavourites";

const FAVES = "users/me/foodFavourites";

/** Seed favourite documents the hook's own subscription will deliver. */
function pumpSnapshot(
  docs: Array<{ id: string; data: Record<string, unknown> }>
) {
  const tree: Record<string, Record<string, unknown>> = {};
  for (const d of docs) tree[`${FAVES}/${d.id}`] = d.data;
  if (Object.keys(tree).length > 0) seedFirestore(tree);
}

/** Writes to the favourites collection, in order. */
const faveWrites = () =>
  writeLog().filter((w) => w.path.startsWith(`${FAVES}/`));

/** Document writes. The fake labels a merge write `set:merge` rather
 *  than `set`, so match the family — the hook always merges, and
 *  hard-coding one label would silently match nothing. */
const faveSets = () => faveWrites().filter((w) => w.op.startsWith("set"));
const faveDeletes = () => faveWrites().filter((w) => w.op === "delete");

function makeDoc(
  over: Partial<{
    id: string;
    name: string;
    useCount: number;
    timeOfDay: string;
    source: string;
    calories: number;
    lastUsedMs: number;
  }>
) {
  return {
    id: over.id ?? "x",
    data: {
      name: over.name ?? over.id ?? "x",
      calories: over.calories ?? 100,
      protein: 10,
      carbs: 10,
      fat: 5,
      servingSize: "1 serving",
      useCount: over.useCount ?? 1,
      timeOfDay: over.timeOfDay ?? "any",
      source: over.source ?? "manual",
      lastUsed: Timestamp.fromMillis(over.lastUsedMs ?? 0),
    },
  };
}

describe("useFoodFavourites", () => {
  beforeEach(() => {
    resetFirestore();
    trackedEvents.length = 0;
    onlineState.isOnline = true;
  });

  describe("snapshot parsing", () => {
    it("clamps negative + non-numeric useCount and macros to 0", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() =>
        pumpSnapshot([
          {
            id: "bad",
            data: {
              name: "Bad data",
              calories: "NaN garbage",
              protein: -50,
              carbs: undefined,
              fat: 5,
              useCount: -3,
              timeOfDay: "morning",
              source: "manual",
              lastUsed: Timestamp.fromMillis(1000),
            },
          },
        ])
      );
      await waitFor(() => expect(result.current.favourites).toHaveLength(1));
      const fav = result.current.favourites[0];
      expect(fav.useCount).toBe(0);
      expect(fav.calories).toBe(0);
      expect(fav.protein).toBe(0);
      expect(fav.carbs).toBe(0);
      expect(fav.fat).toBe(5);
    });

    it("tie-breaks equal useCount by lastUsed desc", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() =>
        pumpSnapshot([
          makeDoc({ id: "older", useCount: 5, lastUsedMs: 100 }),
          makeDoc({ id: "newer", useCount: 5, lastUsedMs: 200 }),
          makeDoc({ id: "oldest", useCount: 5, lastUsedMs: 50 }),
        ])
      );
      await waitFor(() => expect(result.current.favourites).toHaveLength(3));
      expect(result.current.favourites.map((f) => f.id)).toEqual([
        "newer",
        "older",
        "oldest",
      ]);
    });
  });

  describe("getTimeRelevant", () => {
    it("applies the graduation gate — useCount=1 items never surface", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() =>
        pumpSnapshot([
          makeDoc({ id: "one", useCount: 1, timeOfDay: "morning" }),
          makeDoc({ id: "two", useCount: 2, timeOfDay: "morning" }),
        ])
      );
      await waitFor(() => expect(result.current.favourites).toHaveLength(2));
      const relevant = result.current.getTimeRelevant(8, 10);
      expect(relevant.map((f) => f.id)).toEqual(["two"]);
    });

    it("orders exact-time matches before 'any', regardless of useCount", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() =>
        pumpSnapshot([
          // High-useCount "any" item must NOT push out the morning-tagged item.
          makeDoc({ id: "lunch-any", useCount: 20, timeOfDay: "any" }),
          makeDoc({ id: "breakfast-am", useCount: 3, timeOfDay: "morning" }),
        ])
      );
      await waitFor(() => expect(result.current.favourites).toHaveLength(2));
      const relevant = result.current.getTimeRelevant(8, 10); // 8am → morning
      expect(relevant.map((f) => f.id)).toEqual(["breakfast-am", "lunch-any"]);
    });

    it("backfills with off-time graduated items when under limit", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() =>
        pumpSnapshot([
          makeDoc({ id: "evening", useCount: 4, timeOfDay: "evening" }),
        ])
      );
      await waitFor(() => expect(result.current.favourites).toHaveLength(1));
      const relevant = result.current.getTimeRelevant(8, 5); // morning
      expect(relevant.map((f) => f.id)).toEqual(["evening"]);
    });
  });

  describe("addFavourite", () => {
    it("uses server-side increment(1), not a precomputed number", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() => pumpSnapshot([]));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.addFavourite({
          name: "Oatmeal",
          calories: 200,
          protein: 8,
          carbs: 30,
          fat: 4,
        });
      });
      expect(faveSets()).toHaveLength(1);

      // The old assertion compared the payload against an opaque
      // INCREMENT_SENTINEL symbol the stub minted — it proved a token
      // was passed, not that it behaved like an increment. The fake
      // MATERIALISES the sentinel, so the claim in the test's title is
      // now checkable directly: re-adding accumulates rather than
      // overwriting with a precomputed 1.
      const key = faveSets()[0].path.split("/").pop()!;

      // The title's claim, asserted directly: the PAYLOAD must not be a
      // precomputed number. A local `previousCount + 1` would be, and
      // would still land on the right stored value here — so asserting
      // only the result cannot tell the two apart. (Checked: mutating
      // the hook to write `predictedCount` leaves an accumulation-only
      // assertion green.) The point of increment() is concurrent
      // multi-device writes, where the local count is stale.
      expect(
        typeof (faveSets()[0].data as Record<string, unknown>).useCount
      ).not.toBe("number");
      expect(readDoc(`${FAVES}/${key}`)!.useCount).toBe(1);

      await act(async () => {
        await result.current.addFavourite({
          name: "Oatmeal",
          calories: 200,
          protein: 8,
          carbs: 30,
          fat: 4,
        });
      });
      expect(readDoc(`${FAVES}/${key}`)!.useCount).toBe(2);
    });

    it("preserves Unicode characters in the doc-id key (CJK, accents)", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() => pumpSnapshot([]));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.addFavourite({
          name: "炒飯",
          calories: 350,
          protein: 8,
          carbs: 50,
          fat: 12,
        });
        await result.current.addFavourite({
          name: "Piña colada",
          calories: 200,
          protein: 0,
          carbs: 30,
          fat: 5,
        });
      });
      expect(faveSets()[0].path.split("/").pop()).toBe("炒飯");
      // NFKC + lower-case + whitespace→_
      expect(faveSets()[1].path.split("/").pop()).toBe("piña_colada");
    });

    it("rejects zero-macro junk (OFF safety check)", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() => pumpSnapshot([]));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        const res = await result.current.addFavourite({
          name: "Mystery item",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        });
        expect(res.count).toBe(0);
      });
      expect(faveSets()).toHaveLength(0);
    });

    it("sets timeOfDay + source on first write only", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() => pumpSnapshot([]));
      await waitFor(() => expect(result.current.loading).toBe(false));
      // First write — payload includes timeOfDay + source.
      await act(async () => {
        await result.current.addFavourite({
          name: "Oats",
          calories: 200,
          protein: 8,
          carbs: 30,
          fat: 4,
          source: "search",
        });
      });
      expect(faveSets()[0].data).toHaveProperty("timeOfDay");
      expect(faveSets()[0].data).toHaveProperty("source", "search");

      // Now simulate the snapshot reflecting the new doc.
      act(() =>
        pumpSnapshot([
          makeDoc({
            id: "oats",
            name: "Oats",
            useCount: 1,
            timeOfDay: "morning",
            source: "search",
          }),
        ])
      );

      // Second write — payload must NOT overwrite timeOfDay/source.
      await act(async () => {
        await result.current.addFavourite({
          name: "Oats",
          calories: 200,
          protein: 8,
          carbs: 30,
          fat: 4,
          source: "manual",
        });
      });
      expect(faveSets()[1].data).not.toHaveProperty("timeOfDay");
      expect(faveSets()[1].data).not.toHaveProperty("source");
    });

    it("flags graduation when previousCount=1 transitions to 2", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() =>
        pumpSnapshot([makeDoc({ id: "oats", name: "Oats", useCount: 1 })])
      );
      await waitFor(() => expect(result.current.favourites).toHaveLength(1));
      let res: { isNew: boolean; count: number } | undefined;
      await act(async () => {
        res = await result.current.addFavourite({
          name: "Oats",
          calories: 200,
          protein: 8,
          carbs: 30,
          fat: 4,
        });
      });
      expect(res?.isNew).toBe(true);
      expect(res?.count).toBe(2);
    });

    it("does NOT flag graduation on the first log (0 → 1)", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() => pumpSnapshot([]));
      await waitFor(() => expect(result.current.loading).toBe(false));
      let res: { isNew: boolean; count: number } | undefined;
      await act(async () => {
        res = await result.current.addFavourite({
          name: "Oats",
          calories: 200,
          protein: 8,
          carbs: 30,
          fat: 4,
        });
      });
      expect(res?.isNew).toBe(false);
    });
  });

  describe("eviction (snapshot-driven, debounced)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function makeManyDocs(n: number, ages: number[] = []) {
      // useCount monotonically increases with id so we can predict
      // which docs sort to the "lowest useCount" front of the queue.
      return Array.from({ length: n }, (_, i) => ({
        id: `fav-${i}`,
        data: {
          name: `Food ${i}`,
          calories: 100,
          protein: 10,
          carbs: 10,
          fat: 5,
          servingSize: "1 serving",
          useCount: i + 1,
          timeOfDay: "any",
          source: "manual",
          lastUsed: Timestamp.fromMillis(ages[i] ?? i * 1000),
        },
      }));
    }

    it("does NOT evict when length is at or below the cap", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot(makeManyDocs(50));
      });
      expect(result.current.favourites).toHaveLength(50);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(faveDeletes()).toHaveLength(0);
    });

    it("evicts the lowest-useCount entry after the debounce when over cap", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      // 51 docs — index 0 has useCount=1 (the fossil), index 50 has 51.
      await act(async () => {
        pumpSnapshot(makeManyDocs(51));
      });
      expect(result.current.favourites).toHaveLength(51);
      // Before the debounce — no eviction yet.
      expect(faveDeletes()).toHaveLength(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(faveDeletes()).toHaveLength(1);
      expect(faveDeletes()[0].path.split("/").pop()).toBe("fav-0");
    });

    it("tie-breaks equal useCount by oldest lastUsed", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      // 51 docs, all useCount=1, varied lastUsed timestamps. The
      // doc with the smallest lastUsed (`fav-0` at ms=0) is the
      // eviction target.
      const docs = Array.from({ length: 51 }, (_, i) => ({
        id: `fav-${i}`,
        data: {
          name: `Food ${i}`,
          calories: 100,
          protein: 10,
          carbs: 10,
          fat: 5,
          servingSize: "1 serving",
          useCount: 1,
          timeOfDay: "any",
          source: "manual",
          lastUsed: Timestamp.fromMillis(i * 1000),
        },
      }));
      await act(async () => {
        pumpSnapshot(docs);
      });
      expect(result.current.favourites).toHaveLength(51);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(faveDeletes()).toHaveLength(1);
      expect(faveDeletes()[0].path.split("/").pop()).toBe("fav-0");
    });

    it("does NOT evict while offline", async () => {
      onlineState.isOnline = false;
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot(makeManyDocs(60));
      });
      expect(result.current.favourites).toHaveLength(60);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(faveDeletes()).toHaveLength(0);
    });

    it("emits food_pantry_eviction analytics with id + useCount + totalBefore", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot(makeManyDocs(51));
      });
      expect(result.current.favourites).toHaveLength(51);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      const ev = trackedEvents.find((e) => e.event === "food_pantry_eviction");
      expect(ev).toBeDefined();
      expect(ev?.metadata.favouriteId).toBe("fav-0");
      expect(ev?.metadata.useCount).toBe(1);
      expect(ev?.metadata.totalBefore).toBe(51);
    });
  });

  describe("graduation events", () => {
    it("does NOT fire on the initial snapshot (existing useCount>=2 docs)", async () => {
      // Seed BEFORE mount. The docs must be present in the FIRST
      // snapshot the hook receives — that is what "existing" means, and
      // it is the case the guard exists for. Under the old stub the
      // ordering was accidental: it never fired until pumped, so the
      // pumped batch WAS the first snapshot. The fake delivers on
      // subscribe, so seeding afterwards makes these arrivals a
      // second, changed snapshot — a graduation, correctly.
      pumpSnapshot([
        makeDoc({ id: "a", useCount: 5 }),
        makeDoc({ id: "b", useCount: 3 }),
      ]);
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        await flushSnapshots();
      });
      expect(result.current.graduationToken).toBe(0);
      const evs = trackedEvents.filter(
        (e) => e.event === "food_pantry_graduated"
      );
      expect(evs).toHaveLength(0);
    });

    it("fires on the < 2 → >= 2 transition between snapshots", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot([makeDoc({ id: "a", useCount: 1 })]);
      });
      expect(result.current.graduationToken).toBe(0);
      // Second snapshot reflects the graduation.
      await act(async () => {
        pumpSnapshot([makeDoc({ id: "a", useCount: 2 })]);
      });
      expect(result.current.graduationToken).toBe(1);
      const ev = trackedEvents.find((e) => e.event === "food_pantry_graduated");
      expect(ev?.metadata.favouriteId).toBe("a");
      expect(ev?.metadata.useCount).toBe(2);
    });

    it("catches multi-increment jumps (1 → 3 via offline sync)", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot([makeDoc({ id: "a", useCount: 1 })]);
      });
      await act(async () => {
        pumpSnapshot([makeDoc({ id: "a", useCount: 3 })]);
      });
      expect(result.current.graduationToken).toBe(1);
    });

    it("includes the originating source on the graduation event", async () => {
      renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot([makeDoc({ id: "a", useCount: 1, source: "nl" })]);
      });
      await act(async () => {
        pumpSnapshot([makeDoc({ id: "a", useCount: 2, source: "nl" })]);
      });
      const ev = trackedEvents.find((e) => e.event === "food_pantry_graduated");
      expect(ev?.metadata.source).toBe("nl");
    });
  });

  describe("restoreFavourite", () => {
    it("writes the captured favourite back via setDoc(merge:false)", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot([]);
      });
      // Tests use FakeTimestamp via the firebase mock; the production
      // type is the real Timestamp class. The shape is structurally
      // compatible (toMillis), so cast at the boundary.
      const captured = {
        id: "oats",
        name: "Oats",
        calories: 200,
        protein: 8,
        carbs: 30,
        fat: 4,
        fiber: undefined,
        sugar: undefined,
        sodium: undefined,
        servingSize: "1 bowl",
        lastUsed: Timestamp.fromMillis(12345),
        useCount: 7,
        timeOfDay: "morning" as const,
        source: "nl" as const,
      } as unknown as Parameters<typeof result.current.restoreFavourite>[0];
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.restoreFavourite(captured);
      });
      expect(ok).toBe(true);
      expect(faveSets()).toHaveLength(1);
      expect(faveSets()[0].path.split("/").pop()).toBe("oats");
      // Restored payload preserves the captured numerics — undo must
      // not bump useCount or reset lastUsed.
      expect((faveSets()[0].data as Record<string, unknown>).useCount).toBe(7);
      expect((faveSets()[0].data as Record<string, unknown>).lastUsed).toBe(
        captured.lastUsed
      );
      expect((faveSets()[0].data as Record<string, unknown>).timeOfDay).toBe(
        "morning"
      );
      expect((faveSets()[0].data as Record<string, unknown>).source).toBe("nl");
    });
  });

  describe("removeFavourite", () => {
    it("calls deleteDoc with the favourite id", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() => pumpSnapshot([]));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.removeFavourite("oats");
      });
      expect(faveDeletes()).toHaveLength(1);
      expect(faveDeletes()[0].path.split("/").pop()).toBe("oats");
    });
  });
});

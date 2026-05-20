import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const onlineState = { isOnline: true };
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => onlineState,
}));

const trackedEvents: Array<{ event: string; metadata: Record<string, unknown> }> = [];
vi.mock("@/lib/foodAnalytics", () => ({
  track: vi.fn((event: string, metadata: Record<string, unknown>) => {
    trackedEvents.push({ event, metadata });
  }),
}));

// vi.mock factories are hoisted — anything they reference must come
// from vi.hoisted() or be defined inline inside the factory.
const fixtures = vi.hoisted(() => {
  const snapshotListeners: Array<
    (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void
  > = [];
  const setDocCalls: Array<{ ref: { id: string }; payload: Record<string, unknown> }> = [];
  const deleteDocCalls: Array<{ ref: { id: string } }> = [];
  const INCREMENT_SENTINEL = Symbol("FieldValue.increment");
  class FakeTimestamp {
    millis: number;
    constructor(millis: number) {
      this.millis = millis;
    }
    toMillis() {
      return this.millis;
    }
    static now() {
      return new FakeTimestamp(Date.now());
    }
    static fromMillis(ms: number) {
      return new FakeTimestamp(ms);
    }
  }
  return {
    snapshotListeners,
    setDocCalls,
    deleteDocCalls,
    INCREMENT_SENTINEL,
    FakeTimestamp,
  };
});

const {
  snapshotListeners,
  setDocCalls,
  deleteDocCalls,
  INCREMENT_SENTINEL,
  FakeTimestamp,
} = fixtures;

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn((c: unknown) => c),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      onNext: (snap: {
        docs: Array<{ id: string; data: () => Record<string, unknown> }>;
      }) => void,
    ) => {
      fixtures.snapshotListeners.push(onNext);
      return () => {};
    },
  ),
  doc: vi.fn(
    (_db: unknown, _coll: string, _uid: string, _sub: string, id: string) => ({ id }),
  ),
  setDoc: vi.fn(async (ref: { id: string }, payload: Record<string, unknown>) => {
    fixtures.setDocCalls.push({ ref, payload });
  }),
  deleteDoc: vi.fn(async (ref: { id: string }) => {
    fixtures.deleteDocCalls.push({ ref });
  }),
  increment: vi.fn(() => fixtures.INCREMENT_SENTINEL),
  Timestamp: fixtures.FakeTimestamp,
}));

import { useFoodFavourites } from "../useFoodFavourites";

function pumpSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  snapshotListeners.forEach((l) =>
    l({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }),
  );
}

function makeDoc(over: Partial<{
  id: string;
  name: string;
  useCount: number;
  timeOfDay: string;
  source: string;
  calories: number;
  lastUsedMs: number;
}>) {
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
      lastUsed: new FakeTimestamp(over.lastUsedMs ?? 0),
    },
  };
}

describe("useFoodFavourites", () => {
  beforeEach(() => {
    snapshotListeners.length = 0;
    setDocCalls.length = 0;
    deleteDocCalls.length = 0;
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
              lastUsed: new FakeTimestamp(1000),
            },
          },
        ]),
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
        ]),
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
        ]),
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
        ]),
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
        ]),
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
      expect(setDocCalls).toHaveLength(1);
      expect(setDocCalls[0].payload.useCount).toBe(INCREMENT_SENTINEL);
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
      expect(setDocCalls[0].ref.id).toBe("炒飯");
      // NFKC + lower-case + whitespace→_
      expect(setDocCalls[1].ref.id).toBe("piña_colada");
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
      expect(setDocCalls).toHaveLength(0);
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
      expect(setDocCalls[0].payload).toHaveProperty("timeOfDay");
      expect(setDocCalls[0].payload).toHaveProperty("source", "search");

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
        ]),
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
      expect(setDocCalls[1].payload).not.toHaveProperty("timeOfDay");
      expect(setDocCalls[1].payload).not.toHaveProperty("source");
    });

    it("flags graduation when previousCount=1 transitions to 2", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      act(() =>
        pumpSnapshot([makeDoc({ id: "oats", name: "Oats", useCount: 1 })]),
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
          lastUsed: new FakeTimestamp(ages[i] ?? i * 1000),
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
      expect(deleteDocCalls).toHaveLength(0);
    });

    it("evicts the lowest-useCount entry after the debounce when over cap", async () => {
      const { result } = renderHook(() => useFoodFavourites());
      // 51 docs — index 0 has useCount=1 (the fossil), index 50 has 51.
      await act(async () => {
        pumpSnapshot(makeManyDocs(51));
      });
      expect(result.current.favourites).toHaveLength(51);
      // Before the debounce — no eviction yet.
      expect(deleteDocCalls).toHaveLength(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(deleteDocCalls).toHaveLength(1);
      expect(deleteDocCalls[0].ref.id).toBe("fav-0");
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
          lastUsed: new FakeTimestamp(i * 1000),
        },
      }));
      await act(async () => {
        pumpSnapshot(docs);
      });
      expect(result.current.favourites).toHaveLength(51);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(deleteDocCalls).toHaveLength(1);
      expect(deleteDocCalls[0].ref.id).toBe("fav-0");
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
      expect(deleteDocCalls).toHaveLength(0);
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
      const { result } = renderHook(() => useFoodFavourites());
      await act(async () => {
        pumpSnapshot([
          makeDoc({ id: "a", useCount: 5 }),
          makeDoc({ id: "b", useCount: 3 }),
        ]);
      });
      expect(result.current.graduationToken).toBe(0);
      const evs = trackedEvents.filter((e) => e.event === "food_pantry_graduated");
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
        lastUsed: new FakeTimestamp(12345),
        useCount: 7,
        timeOfDay: "morning" as const,
        source: "nl" as const,
      } as unknown as Parameters<typeof result.current.restoreFavourite>[0];
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.restoreFavourite(captured);
      });
      expect(ok).toBe(true);
      expect(setDocCalls).toHaveLength(1);
      expect(setDocCalls[0].ref.id).toBe("oats");
      // Restored payload preserves the captured numerics — undo must
      // not bump useCount or reset lastUsed.
      expect(setDocCalls[0].payload.useCount).toBe(7);
      expect(setDocCalls[0].payload.lastUsed).toBe(captured.lastUsed);
      expect(setDocCalls[0].payload.timeOfDay).toBe("morning");
      expect(setDocCalls[0].payload.source).toBe("nl");
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
      expect(deleteDocCalls).toHaveLength(1);
      expect(deleteDocCalls[0].ref.id).toBe("oats");
    });
  });
});

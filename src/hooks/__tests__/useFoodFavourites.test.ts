import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
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

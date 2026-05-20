import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Auth — single test user
const mockUser = { uid: "me" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Firebase wiring — capture the snapshot listener so tests can pump
// data through it, and capture the runTransaction calls so the edit
// path's bumps can be inspected.
const snapshotListeners: Array<(snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void> = [];
const transactionCalls: Array<{
  ref: { id: string };
  update: Record<string, unknown> | null;
  thrown: string | null;
}> = [];
let mockDocState: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() } }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn((c: unknown) => c),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_q: unknown, onNext: (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) => {
    snapshotListeners.push(onNext);
    return () => {};
  }),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, _coll: string, _uid: string, _sub: string, id: string) => ({ id })),
  limit: vi.fn(),
  startAfter: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "__SERVER_TIMESTAMP__"),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: {
    get: (ref: { id: string }) => Promise<{
      exists: () => boolean;
      data: () => Record<string, unknown>;
    }>;
    update: (ref: { id: string }, update: Record<string, unknown>) => void;
  }) => Promise<void>) => {
    const call: typeof transactionCalls[number] = { ref: { id: "" }, update: null, thrown: null };
    try {
      await fn({
        get: async (ref) => {
          call.ref = ref;
          const data = mockDocState[ref.id];
          return {
            exists: () => data !== undefined,
            data: () => data ?? {},
          };
        },
        update: (ref, update) => {
          call.ref = ref;
          call.update = update;
        },
      });
    } catch (err) {
      call.thrown = err instanceof Error ? err.message : String(err);
      transactionCalls.push(call);
      throw err;
    }
    transactionCalls.push(call);
  }),
}));

import { useMeals } from "../useMeals";

function pumpSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  snapshotListeners.forEach((l) =>
    l({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }),
  );
}

describe("useMeals", () => {
  beforeEach(() => {
    snapshotListeners.length = 0;
    transactionCalls.length = 0;
    mockDocState = {};
  });

  describe("parseMealDoc lazy migration (F5b)", () => {
    it("defaults missing revisionCount + userEditCount to 0 on docs predating the F5b fields", async () => {
      const { result } = renderHook(() => useMeals());
      act(() => {
        pumpSnapshot([
          {
            id: "old-doc",
            data: {
              date: "2026-05-20",
              foodName: "Eggs",
              items: [],
              totalCalories: 200,
              totalProtein: 12,
              totalCarbs: 1,
              totalFat: 14,
              confidence: "high",
              createdAt: "__OLD_TS__",
              // NO revisionCount / userEditCount / updatedAt — pre-F5b doc
            },
          },
        ]);
      });
      await waitFor(() => expect(result.current.meals).toHaveLength(1));
      const meal = result.current.meals[0];
      expect(meal.revisionCount).toBe(0);
      expect(meal.userEditCount).toBe(0);
      // updatedAt defaults to createdAt so "last modified" comparisons
      // work for unmigrated docs without a separate flag check.
      expect(meal.updatedAt).toBe("__OLD_TS__");
    });

    it("preserves existing counter values on F5b-migrated docs", async () => {
      const { result } = renderHook(() => useMeals());
      act(() => {
        pumpSnapshot([
          {
            id: "edited-doc",
            data: {
              date: "2026-05-20",
              foodName: "Chicken",
              items: [],
              totalCalories: 400,
              totalProtein: 50,
              totalCarbs: 0,
              totalFat: 20,
              confidence: "high",
              createdAt: "__T1__",
              updatedAt: "__T2__",
              revisionCount: 3,
              userEditCount: 2,
            },
          },
        ]);
      });
      await waitFor(() => expect(result.current.meals).toHaveLength(1));
      const meal = result.current.meals[0];
      expect(meal.revisionCount).toBe(3);
      expect(meal.userEditCount).toBe(2);
      expect(meal.updatedAt).toBe("__T2__");
    });
  });

  describe("editMeal (F5a)", () => {
    it("bumps revisionCount + userEditCount atomically and stamps updatedAt", async () => {
      mockDocState["meal-1"] = {
        revisionCount: 4,
        userEditCount: 1,
      };
      const { result } = renderHook(() => useMeals());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        await result.current.editMeal("meal-1", { foodName: "Eggs (large)" });
      });
      expect(transactionCalls).toHaveLength(1);
      expect(transactionCalls[0].update).toEqual({
        foodName: "Eggs (large)",
        updatedAt: "__SERVER_TIMESTAMP__",
        revisionCount: 5,
        userEditCount: 2,
      });
    });

    it("initialises counters from 0 when editing a pre-F5b doc (lazy migration)", async () => {
      mockDocState["meal-old"] = {
        // No revisionCount / userEditCount fields — predates F5b
        foodName: "Toast",
      };
      const { result } = renderHook(() => useMeals());
      act(() => {
        pumpSnapshot([]);
      });
      await act(async () => {
        await result.current.editMeal("meal-old", { totalCalories: 150 });
      });
      expect(transactionCalls[0].update).toMatchObject({
        revisionCount: 1,
        userEditCount: 1,
      });
    });

    it("rejects edits whose macro values trip the validation BLOCK floor (negative / non-finite)", async () => {
      mockDocState["meal-1"] = { revisionCount: 0, userEditCount: 0 };
      const { result } = renderHook(() => useMeals());
      act(() => {
        pumpSnapshot([]);
      });
      // foodValidation BLOCKs on non-finite / NaN / negative numbers
      // (the high-but-finite case returns WARN, which is the UI's
      // confirmation surface, not the hook's gate).
      await expect(
        result.current.editMeal("meal-1", { totalCalories: -10 }),
      ).rejects.toThrow();
      // No transaction should have completed when the validation
      // gate fired before the runTransaction call.
      expect(transactionCalls).toHaveLength(0);
    });

    it("throws when the meal does not exist (deleted between fetch and edit)", async () => {
      // mockDocState empty → exists() returns false
      const { result } = renderHook(() => useMeals());
      act(() => {
        pumpSnapshot([]);
      });
      await expect(
        result.current.editMeal("missing-meal", { foodName: "x" }),
      ).rejects.toThrow(/not found/i);
    });
  });
});

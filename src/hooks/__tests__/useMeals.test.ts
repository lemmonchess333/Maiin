import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Auth — single test user
const mockUser = { uid: "me" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser }),
  useUid: () => ({ user: mockUser }).user?.uid ?? null,
}));

/**
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 *
 * The factory hand-rolled `runTransaction` — its own tx `get`/`update`
 * over a `mockDocState` map — so the edit path ran against a second,
 * simpler Firestore whose `get` could disagree with what the snapshot
 * listener had just delivered. Meals are now real documents under
 * `users/me/meals`: the transaction reads what was seeded, and the
 * update payloads are read back off `writeLog()` rather than off a
 * capture array the stub filled in.
 *
 * `pumpSnapshot` is gone for the same reason it went in `useClaimMap` —
 * it fed the hook instead of letting the hook read a store, which meant
 * the `orderBy`/`limit` query was never exercised.
 */
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));
vi.mock("firebase/firestore");

import { useMeals } from "../useMeals";
import {
  seedFirestore,
  resetFirestore,
  writeLog,
  readDoc,
  flushSnapshots,
} from "@/test/firestoreHarness";

const MEALS = "users/me/meals";

/** Seed meal documents the hook's own subscription will deliver. */
function seedMeals(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  const tree: Record<string, Record<string, unknown>> = {};
  for (const d of docs) tree[`${MEALS}/${d.id}`] = d.data;
  seedFirestore(tree);
}

/** Transactional update patches, in order — the shape the old
 *  `transactionCalls[i].update` captured, read off the real write log. */
const updatePatches = () =>
  writeLog()
    .filter((w) => w.op === "update" && w.path.startsWith(`${MEALS}/`))
    .map((w) => w.data as Record<string, unknown>);

describe("useMeals", () => {
  beforeEach(() => {
    resetFirestore();
  });

  describe("parseMealDoc lazy migration (F5b)", () => {
    it("defaults missing revisionCount + userEditCount to 0 on docs predating the F5b fields", async () => {
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        seedMeals([
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
        await flushSnapshots();
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
      await act(async () => {
        seedMeals([
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
        await flushSnapshots();
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
      seedMeals([
        {
          id: "meal-1",
          data: {
            revisionCount: 4,
            userEditCount: 1,
          },
        },
      ]);
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        await flushSnapshots();
      });
      await act(async () => {
        await result.current.editMeal("meal-1", { foodName: "Eggs (large)" });
      });
      expect(updatePatches()).toHaveLength(1);
      expect(updatePatches()[0]).toEqual({
        foodName: "Eggs (large)",
        // The raw patch carries the serverTimestamp SENTINEL — the
        // old stub swapped in a magic string, which hid whether a
        // sentinel was sent at all. Materialisation is asserted
        // separately below, off the stored document.
        updatedAt: expect.anything(),
        revisionCount: 5,
        userEditCount: 2,
        userEditedFields: ["foodName"],
      });
      // ...and the sentinel really did resolve to a timestamp in the store.
      const stored = readDoc(`${MEALS}/meal-1`)!;
      expect(stored.updatedAt).toHaveProperty("seconds");
    });

    it("initialises counters from 0 when editing a pre-F5b doc (lazy migration)", async () => {
      seedMeals([
        {
          id: "meal-old",
          data: {
            // No revisionCount / userEditCount fields — predates F5b
            foodName: "Toast",
          },
        },
      ]);
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        await flushSnapshots();
      });
      await act(async () => {
        await result.current.editMeal("meal-old", { totalCalories: 150 });
      });
      expect(updatePatches()[0]).toMatchObject({
        revisionCount: 1,
        userEditCount: 1,
      });
    });

    it("rejects edits whose macro values trip the validation BLOCK floor (negative / non-finite)", async () => {
      seedMeals([
        { id: "meal-1", data: { revisionCount: 0, userEditCount: 0 } },
      ]);
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        await flushSnapshots();
      });
      // foodValidation BLOCKs on non-finite / NaN / negative numbers
      // (the high-but-finite case returns WARN, which is the UI's
      // confirmation surface, not the hook's gate).
      await expect(
        result.current.editMeal("meal-1", { totalCalories: -10 })
      ).rejects.toThrow();
      // No transaction should have completed when the validation
      // gate fired before the runTransaction call.
      expect(updatePatches()).toHaveLength(0);
    });

    it("throws when the meal does not exist (deleted between fetch and edit)", async () => {
      // mockDocState empty → exists() returns false
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        await flushSnapshots();
      });
      await expect(
        result.current.editMeal("missing-meal", { foodName: "x" })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("F1d userEditedFields (per-field edit locks)", () => {
    it("parseMealDoc defaults missing userEditedFields to an empty array", async () => {
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        seedMeals([
          {
            id: "pre-f1d",
            data: {
              date: "2026-05-20",
              foodName: "Eggs",
              items: [],
              totalCalories: 200,
              totalProtein: 12,
              totalCarbs: 1,
              totalFat: 14,
              confidence: "high",
              createdAt: "__T1__",
              // No userEditedFields — predates F1d
            },
          },
        ]);
        await flushSnapshots();
      });
      await waitFor(() => expect(result.current.meals).toHaveLength(1));
      expect(result.current.meals[0].userEditedFields).toEqual([]);
    });

    it("parseMealDoc filters non-string entries out of userEditedFields", async () => {
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        seedMeals([
          {
            id: "corrupt",
            data: {
              date: "2026-05-20",
              foodName: "Eggs",
              items: [],
              totalCalories: 0,
              totalProtein: 0,
              totalCarbs: 0,
              totalFat: 0,
              confidence: "low",
              createdAt: "__T1__",
              // Mixed array — only string keys survive
              userEditedFields: [
                "foodName",
                42,
                null,
                "totalCalories",
                undefined,
              ],
            },
          },
        ]);
        await flushSnapshots();
      });
      await waitFor(() => expect(result.current.meals).toHaveLength(1));
      expect(result.current.meals[0].userEditedFields).toEqual([
        "foodName",
        "totalCalories",
      ]);
    });

    it("editMeal adds edited keys to userEditedFields, deduped, union with existing", async () => {
      // `totalCarbs` is locked but NOT edited here, and `foodName` is
      // both. That combination is deliberate: it separates the two
      // claims in the title. Until 2026-07-26 the seed was
      // `["foodName"]` alone and every edited key was already in it, so
      // "union with existing" and "just the new keys" produced the same
      // array — discarding the transaction's read of `current` passed
      // the test. With `totalCarbs` present, dropping the union loses it.
      seedMeals([
        {
          id: "meal-1",
          data: {
            revisionCount: 1,
            userEditCount: 1,
            userEditedFields: ["foodName", "totalCarbs"],
          },
        },
      ]);
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        await flushSnapshots();
      });
      await act(async () => {
        await result.current.editMeal("meal-1", {
          foodName: "Boiled eggs",
          totalCalories: 80,
        });
      });
      const writtenLocks = updatePatches()[0].userEditedFields as string[];
      // Existing locks retained (incl. the un-edited `totalCarbs`), new
      // 'foodName' deduped, 'totalCalories' added.
      expect(writtenLocks).toEqual(
        expect.arrayContaining(["foodName", "totalCarbs", "totalCalories"])
      );
      expect(writtenLocks).toHaveLength(3);
    });

    it("editMeal initialises userEditedFields from empty when the doc predates F1d", async () => {
      seedMeals([{ id: "meal-old", data: { foodName: "Toast" } }]);
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        await flushSnapshots();
      });
      await act(async () => {
        await result.current.editMeal("meal-old", { totalProtein: 10 });
      });
      expect(updatePatches()[0].userEditedFields).toEqual(["totalProtein"]);
    });
  });
});

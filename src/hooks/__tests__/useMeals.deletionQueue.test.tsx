import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: { currentUser: { uid: "meal-owner" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => session.currentUser.uid }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: session }));
vi.mock("firebase/firestore");
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/activationTracker", () => ({ noteActivitySnapshot: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/foodPhotoStore", () => ({
  deleteFoodPhoto: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({
  invalidateFoodPhotoCache: vi.fn(),
}));

import { Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createMealEntry } from "@/lib/mealEntry";
import {
  flushQueue,
  pendingDocumentWrites,
  queueDurableWrite,
  getFailedMealSaveCount,
} from "@/lib/offlineQueue";
import {
  flushSnapshots,
  readDoc,
  resetFirestore,
  seedFirestore,
  failNextFirestore,
  deferReads,
  pendingReads,
  releaseAllReads,
} from "@/test/firestoreHarness";
import { useMeals } from "../useMeals";
import { deleteFoodPhoto } from "@/lib/foodPhotoStore";

const uid = "meal-owner";
const path = `users/${uid}/meals`;
const meal = {
  date: "2026-10-14",
  foodName: "Oats",
  totalCalories: 420,
  totalProtein: 20,
  totalCarbs: 60,
  totalFat: 10,
  createdAt: Timestamp.fromMillis(1_700_000_000_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  resetFirestore();
  localStorage.clear();
  session.currentUser.uid = uid;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("queued diary deletion and restoration", () => {
  it("does not replay an acknowledged create after permanent deletion", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await createMealEntry(uid, meal, "new-meal");
    // Interrupted after server acceptance, before local queue retirement;
    // another client has since soft-deleted the acknowledged meal.
    seedFirestore({
      [`${path}/new-meal`]: { ...meal, deletedAt: Timestamp.now() },
    });
    const { result } = renderHook(() => useMeals());
    online.mockReturnValue(true);
    await act(async () => result.current.hardDeleteMeal("new-meal"));
    expect(readDoc(`${path}/new-meal`)).toBeUndefined();
    await act(async () => {
      await flushQueue(db, uid);
      await flushSnapshots();
    });
    expect(readDoc(`${path}/new-meal`)).toBeUndefined();
    expect(result.current.meals.map((row) => row.id)).not.toContain("new-meal");
  });

  it("drains a failed restore before permanent deletion instead of recreating an orphan", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    seedFirestore({
      [`${path}/deleted`]: { ...meal, deletedAt: Timestamp.now() },
    });
    const { result } = renderHook(() => useMeals());
    await result.current.restoreMeal("deleted");
    await flushQueue(db, uid);
    failNextFirestore("setDoc", {
      path: `${path}/deleted`,
      code: "unavailable",
    });
    online.mockReturnValue(true);
    await flushQueue(db, uid);
    expect(getFailedMealSaveCount(uid)).toBe(1);
    await act(async () => result.current.hardDeleteMeal("deleted"));
    expect(readDoc(`${path}/deleted`)).toBeUndefined();
    expect(pendingDocumentWrites(uid, path)).toEqual([]);
    await flushQueue(db, uid);
    expect(readDoc(`${path}/deleted`)).toBeUndefined();
    expect(deleteFoodPhoto).toHaveBeenCalledWith(uid, "deleted");
  });

  it("refuses deletion while an unrelated failure keeps this meal's accepted restore pending", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    seedFirestore({
      [`${path}/deleted`]: { ...meal, deletedAt: Timestamp.now() },
    });
    queueDurableWrite(uid, path, "unrelated", meal);
    const { result } = renderHook(() => useMeals());
    await result.current.restoreMeal("deleted");
    await flushQueue(db, uid);
    const before = pendingDocumentWrites(uid, path);
    failNextFirestore("commit", { code: "unavailable" });
    online.mockReturnValue(true);
    await expect(result.current.hardDeleteMeal("deleted")).rejects.toThrow(
      "changes waiting to sync"
    );
    expect(readDoc(`${path}/deleted`)?.foodName).toBe("Oats");
    expect(readDoc(`${path}/deleted`)?.deletedAt).toBeTruthy();
    expect(pendingDocumentWrites(uid, path)).toEqual(before);
    expect(deleteFoodPhoto).not.toHaveBeenCalled();
  });

  it("does not delete under another account after a queued transaction read", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await createMealEntry(uid, meal, "deleted");
    await flushQueue(db, uid);
    seedFirestore({
      [`${path}/deleted`]: { ...meal, deletedAt: Timestamp.now() },
    });
    const { result } = renderHook(() => useMeals());
    deferReads();
    online.mockReturnValue(true);
    const deleting = result.current.hardDeleteMeal("deleted");
    const refused = expect(deleting).rejects.toThrow("Sign in again");
    await vi.waitFor(() => expect(pendingReads()).toHaveLength(1));
    session.currentUser.uid = "another-user";
    releaseAllReads();
    await refused;
    expect(readDoc(`${path}/deleted`)?.foodName).toBe("Oats");
    expect(pendingDocumentWrites(uid, path)).toHaveLength(1);
    expect(pendingDocumentWrites("another-user", path)).toEqual([]);
    expect(deleteFoodPhoto).not.toHaveBeenCalled();
  });

  it("requires connection and preserves the record, queue and photo until a retry can delete", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await createMealEntry(uid, meal, "deleted");
    await flushQueue(db, uid);
    seedFirestore({
      [`${path}/deleted`]: { ...meal, deletedAt: Timestamp.now() },
    });
    const { result } = renderHook(() => useMeals());
    await expect(result.current.hardDeleteMeal("deleted")).rejects.toThrow(
      "Connect to permanently delete"
    );
    expect(readDoc(`${path}/deleted`)?.foodName).toBe("Oats");
    expect(pendingDocumentWrites(uid, path)).toHaveLength(1);
    expect(deleteFoodPhoto).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    await act(async () => result.current.hardDeleteMeal("deleted"));
    expect(readDoc(`${path}/deleted`)).toBeUndefined();
    expect(pendingDocumentWrites(uid, path)).toEqual([]);
  });

  it("permanently deletes a normal acknowledged meal without pending operations", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    seedFirestore({
      [`${path}/deleted`]: { ...meal, deletedAt: Timestamp.now() },
    });
    const { result } = renderHook(() => useMeals());
    await act(async () => result.current.hardDeleteMeal("deleted"));
    expect(readDoc(`${path}/deleted`)).toBeUndefined();
    expect(pendingDocumentWrites(uid, path)).toEqual([]);
    expect(deleteFoodPhoto).toHaveBeenCalledWith(uid, "deleted");
  });

  it.each([false, true])(
    "keeps a newly logged meal complete through offline delete, with restoration=%s",
    async (restore) => {
      const online = vi
        .spyOn(navigator, "onLine", "get")
        .mockReturnValue(false);
      const { result } = renderHook(() => useMeals());
      await act(async () => {
        await createMealEntry(uid, meal, "new-meal");
        await result.current.deleteMeal("new-meal");
        if (restore) await result.current.restoreMeal("new-meal");
      });
      expect(readDoc(`${path}/new-meal`)).toBeUndefined();
      expect(pendingDocumentWrites(uid, path)).toHaveLength(restore ? 3 : 2);
      online.mockReturnValue(true);
      await act(async () => {
        await flushQueue(db, uid);
        await flushSnapshots();
      });
      expect(readDoc(`${path}/new-meal`)).toMatchObject(meal);
      expect(readDoc(`${path}/new-meal`)?.deletedAt).toEqual(
        restore ? null : expect.any(Timestamp)
      );
      expect(pendingDocumentWrites(uid, path)).toEqual([]);
    }
  );

  it("refuses a deletion when its recovery intent cannot be persisted", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useMeals());
    await createMealEntry(uid, meal, "new-meal");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await expect(result.current.deleteMeal("new-meal")).rejects.toThrow(
      "Couldn't save on this phone"
    );
    expect(pendingDocumentWrites(uid, path)).toHaveLength(1);
    expect(readDoc(`${path}/new-meal`)).toBeUndefined();
  });
});

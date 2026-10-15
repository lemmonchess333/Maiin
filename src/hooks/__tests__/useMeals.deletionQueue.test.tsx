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

import { Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createMealEntry } from "@/lib/mealEntry";
import { flushQueue, pendingDocumentWrites } from "@/lib/offlineQueue";
import {
  flushSnapshots,
  readDoc,
  resetFirestore,
} from "@/test/firestoreHarness";
import { useMeals } from "../useMeals";

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

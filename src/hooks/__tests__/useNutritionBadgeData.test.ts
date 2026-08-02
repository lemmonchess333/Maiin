/**
 * useNutritionBadgeData — the two per-day reads the target-dependent
 * nutrition badges need.
 *
 * Three things here are worth pinning, and each is a way the badge pass
 * fails QUIETLY rather than loudly:
 *
 *   - `loaded` is the AND of two independent subscriptions. If either one
 *     never resolves the badge pass hangs, so a failing read still flips its
 *     half to loaded. A hook that hung would look identical to one that was
 *     merely slow.
 *   - Water days migrate legacy `glasses` forward (× 250). Historical
 *     hydration streaks depend on it — a day stored before the ml model must
 *     still count, or a user's streak silently breaks in the past.
 *   - The sign-out reset is uid-scoping (CLAUDE.md): one account's per-day
 *     nutrition must not leak into the next session's badge pass on a shared
 *     device.
 *
 * Doc ids are dates, so the clock is fixed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
  useUid: () => ({ user: mockUser, profile: {} }).user?.uid ?? null,
}));

import { useNutritionBadgeData } from "../useNutritionBadgeData";
import {
  seedFirestore,
  resetFirestore,
  flushSnapshots,
  failNextFirestore,
} from "@/test/firestoreHarness";

const NOW = new Date(2026, 6, 15, 9, 0, 0);

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockUser = { uid: "u1" };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("macro targets", () => {
  it("maps each day's snapshotted target", async () => {
    seedFirestore({
      "users/u1/dailyNutrition/2026-07-14": {
        date: "2026-07-14",
        targetCalories: 2400,
        targetProtein: 160,
        targetCarbs: 250,
        targetFat: 70,
      },
    });
    const { result } = renderHook(() => useNutritionBadgeData());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.macroTargetsByDay.get("2026-07-14")).toEqual({
      calories: 2400,
      protein: 160,
      carbs: 250,
      fat: 70,
    });
  });

  it("falls back to the document id when `date` is missing", async () => {
    // The id IS the date; a doc written without the field must still key
    // correctly or that day drops out of the streak window.
    seedFirestore({
      "users/u1/dailyNutrition/2026-07-13": { targetCalories: 2000 },
    });
    const { result } = renderHook(() => useNutritionBadgeData());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.macroTargetsByDay.has("2026-07-13")).toBe(true);
  });

  it("coerces missing or non-numeric targets to 0, never NaN", async () => {
    // NaN would propagate into the badge comparison and silently never hit.
    seedFirestore({
      "users/u1/dailyNutrition/2026-07-12": {
        date: "2026-07-12",
        targetCalories: "oops",
      },
    });
    const { result } = renderHook(() => useNutritionBadgeData());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.macroTargetsByDay.get("2026-07-12")).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe("water", () => {
  it("maps ml days keyed by the document id", async () => {
    seedFirestore({
      "users/u1/waterLog/2026-07-14": {
        ml: 1500,
        targetMl: 2000,
        updatedAt: 2,
      },
    });
    const { result } = renderHook(() => useNutritionBadgeData());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.waterByDay.get("2026-07-14")).toEqual({
      ml: 1500,
      target: 2000,
    });
  });

  it("migrates a legacy glasses-only day forward", async () => {
    // Historical hydration streaks depend on this — a pre-ml day must still
    // count, or the streak silently breaks in the past.
    seedFirestore({
      "users/u1/waterLog/2026-07-13": {
        glasses: 6,
        targetGlasses: 8,
        updatedAt: 1,
      },
    });
    const { result } = renderHook(() => useNutritionBadgeData());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.waterByDay.get("2026-07-13")).toEqual({
      ml: 1500, // 6 × 250
      target: 2000, // 8 × 250
    });
  });
});

describe("loaded", () => {
  it("is false until BOTH subscriptions have delivered", async () => {
    const { result } = renderHook(() => useNutritionBadgeData());
    // Both fire on an empty store, so this settles true — the point is that
    // it is the AND of two, checked by the failure case below.
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("still flips loaded when one subscription FAILS", async () => {
    // Otherwise a single failing read hangs the whole badge pass, which
    // looks identical to "still loading" forever.
    failNextFirestore("onSnapshot", {
      path: "users/u1/dailyNutrition",
      times: 5,
    });
    const { result } = renderHook(() => useNutritionBadgeData());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.macroTargetsByDay.size).toBe(0);
  });
});

describe("account switching", () => {
  it("clears both maps on sign-out — no leak into the next session", async () => {
    // CLAUDE.md uid-scoping: one account's nutrition must not reach the
    // next account's badge pass on a shared device.
    seedFirestore({
      "users/u1/waterLog/2026-07-14": {
        ml: 1500,
        targetMl: 2000,
        updatedAt: 1,
      },
    });
    const { result, rerender } = renderHook(() => useNutritionBadgeData());
    await waitFor(() => expect(result.current.waterByDay.size).toBe(1));

    mockUser = null;
    rerender();
    await flushSnapshots();

    expect(result.current.waterByDay.size).toBe(0);
    expect(result.current.macroTargetsByDay.size).toBe(0);
    expect(result.current.loaded).toBe(false);
  });
});

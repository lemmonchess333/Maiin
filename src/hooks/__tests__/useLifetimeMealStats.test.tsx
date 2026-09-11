/**
 * Lifetime meal totals count everything, not the newest 400.
 *
 * The tile derived both figures from `useMeals`, which subscribes to the
 * newest 400 meal docs — under a comment claiming the hook "returns
 * everything". So "meals logged" saturated at 400 and "days logged" at
 * however many distinct days those covered, and a long-standing user's
 * lifetime numbers quietly stopped moving.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
let currentUid: string | null = "u1";
vi.mock("@/lib/auth", () => ({ useUid: () => currentUid }));

import { useLifetimeMealStats } from "../useLifetimeMealStats";
import {
  resetFirestore,
  seedFirestore,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const meal = (date: string, over: Record<string, unknown> = {}) => ({
  date,
  foodName: `Meal ${date}`,
  totalCalories: 400,
  ...over,
});

beforeEach(() => {
  resetFirestore();
  currentUid = "u1";
});
afterEach(() => vi.clearAllMocks());

describe("useLifetimeMealStats", () => {
  it("counts past the 400 the live subscription stops at", async () => {
    // 900 meals across 450 distinct days: both figures used to saturate.
    const seed: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 900; i += 1) {
      const day = String(i % 450).padStart(3, "0");
      seed[`users/u1/meals/m${i}`] = meal(`2025-01-${day}`);
    }
    seedFirestore(seed);
    const { result } = renderHook(() => useLifetimeMealStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mealCount).toBe(900);
    expect(result.current.daysLogged).toBe(450);
  });

  it("counts DISTINCT days, not meals", async () => {
    // Three meals, one day. The two figures are different questions.
    seedFirestore({
      "users/u1/meals/a": meal("2026-03-01"),
      "users/u1/meals/b": meal("2026-03-01"),
      "users/u1/meals/c": meal("2026-03-01"),
    });
    const { result } = renderHook(() => useLifetimeMealStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mealCount).toBe(3);
    expect(result.current.daysLogged).toBe(1);
  });

  it("excludes soft-deleted meals — the tile says what you kept", async () => {
    seedFirestore({
      "users/u1/meals/kept": meal("2026-03-01"),
      "users/u1/meals/binned": meal("2026-03-02", {
        deletedAt: { toDate: () => new Date() },
      }),
    });
    const { result } = renderHook(() => useLifetimeMealStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mealCount).toBe(1);
    expect(result.current.daysLogged).toBe(1);
  });

  it("a FAILED read is not a user who never logged", async () => {
    /* Zero and "we could not find out" are different states. The run hook
       carries this distinction because zero made History hide a whole
       section with the only evidence in a console the user never sees. */
    seedFirestore({ "users/u1/meals/a": meal("2026-03-01") });
    failNextFirestore("getDocs", { code: "unavailable" });
    const { result } = renderHook(() => useLifetimeMealStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(unfiredFailures()).toEqual([]);
  });

  it("does not read at all when disabled", async () => {
    // The cost gate: a whole-collection read is not free, so surfaces that
    // stop needing it stop paying for it.
    seedFirestore({ "users/u1/meals/a": meal("2026-03-01") });
    const { result } = renderHook(() =>
      useLifetimeMealStats({ enabled: false })
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.mealCount).toBe(0);
  });

  it("never shows one account's totals to the next", async () => {
    seedFirestore({
      "users/u1/meals/a": meal("2026-03-01"),
      "users/u1/meals/b": meal("2026-03-02"),
    });
    const { result, rerender } = renderHook(() => useLifetimeMealStats());
    await waitFor(() => expect(result.current.mealCount).toBe(2));

    currentUid = "u2";
    rerender();
    // Synchronously on the account change — not after the next read lands.
    expect(result.current.mealCount).toBe(0);
    expect(result.current.daysLogged).toBe(0);
  });
});

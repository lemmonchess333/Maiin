/**
 * The review's month card reads (App1 Q56): the month's meals and the plan,
 * for a Pro account, on the month's first review only. Driven through the
 * one Firestore fake (ADR-0009).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockProfile: Record<string, unknown> | null = null;
let mockIsPro = true;
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: mockIsPro }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: mockProfile }),
}));

import { useProMonthReport } from "../useProReport";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

/** Read on Monday 2 November: the month's first review, for October. */
const FIRST_REVIEW = "2026-10-26";
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();

function meal(date: string, confidence: string, extra = {}) {
  return {
    date,
    confidence,
    foodName: "Lunch",
    items: [],
    totalCalories: 600,
    deletedAt: null,
    ...extra,
  };
}

beforeEach(() => {
  resetFirestore();
  mockIsPro = true;
  mockProfile = {
    raceGoal: { distance: "half" },
    proChanges: [
      { kind: "calories", at: at("2026-10-06"), from: 2300, to: 2400 },
      { kind: "calories", at: at("2026-10-13"), from: 2400, to: 2450 },
    ],
  };
  seedFirestore({
    "users/u1/meals/m1": meal("2026-10-02", "high"),
    "users/u1/meals/m2": meal("2026-10-09", "medium"),
    "users/u1/meals/m3": meal("2026-10-10", "ai-parse"),
    "users/u1/meals/m4": meal("2026-10-11", "barcode"),
    // Deleted, and outside the month: neither counts.
    "users/u1/meals/m5": meal("2026-10-12", "high", { deletedAt: new Date() }),
    "users/u1/meals/m6": meal("2026-11-01", "high"),
    "users/u1/programState/current": {
      runPlan: {
        mode: "race_prep",
        currentWeek: 4,
        totalWeeks: 12,
        raceGoal: { distance: "half" },
      },
    },
  });
});

describe("useProMonthReport", () => {
  it("counts the month for a Pro account on its first review", async () => {
    const { result } = renderHook(() => useProMonthReport(FIRST_REVIEW));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.report?.month.name).toBe("October");
    expect(result.current.report?.lines).toEqual([
      { kind: "calories", count: 2, from: 2300, to: 2450 },
      { kind: "photo_scans", count: 2 },
      { kind: "typed_scans", count: 1 },
      { kind: "race_plan", distance: "half", week: 5, totalWeeks: 12 },
    ]);
  });

  it("is an empty report, not none, for a month Pro did nothing in", async () => {
    resetFirestore();
    mockProfile = { proChanges: [] };
    const { result } = renderHook(() => useProMonthReport(FIRST_REVIEW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.report?.lines).toEqual([]);
  });

  it("reads nothing for a free account, or on any other review", () => {
    mockIsPro = false;
    const free = renderHook(() => useProMonthReport(FIRST_REVIEW));
    expect(free.result.current).toEqual({ loading: false, report: null });
    mockIsPro = true;
    const later = renderHook(() => useProMonthReport("2026-11-02"));
    expect(later.result.current).toEqual({ loading: false, report: null });
  });

  it("leaves the card out when the read fails", async () => {
    failNextFirestore("getDocs");
    const { result } = renderHook(() => useProMonthReport(FIRST_REVIEW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.report).toBeNull();
  });
});

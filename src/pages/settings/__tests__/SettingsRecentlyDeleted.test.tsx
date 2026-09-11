/**
 * SettingsRecentlyDeleted — F5c contract tests.
 *
 * Pins the empty state, the restore + hard-delete orchestration, and
 * the sort order (most recently deleted first). This surface just renders
 * the rows its query hands it, so the list is mocked here; the QUERY —
 * which is what made an old meal deleted today unrecoverable — is proven
 * against the Firestore fake in `useDeletedMeals.test.tsx`.
 *
 * (The header used to cite a 24-hour purge cron. There isn't one: no
 * scheduled function touches `meals`, as `useMeals` documents at length.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Meal } from "@/hooks/useMeals";

const restoreMock = vi.fn(async () => undefined);
const hardDeleteMock = vi.fn(async () => undefined);
let deletedMealsMock: Meal[] = [];

vi.mock("@/hooks/useMeals", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/useMeals")>(
      "@/hooks/useMeals"
    );
  return {
    ...actual,
    useMeals: () => ({
      meals: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      deleteMeal: vi.fn(),
      restoreMeal: restoreMock,
      hardDeleteMeal: hardDeleteMock,
      getMealsForDate: vi.fn(() => []),
      getDailyTotals: vi.fn(),
    }),
  };
});

// The screen reads its rows from the deletion-time query now.
vi.mock("@/hooks/useDeletedMeals", () => ({
  useDeletedMeals: () => ({ deletedMeals: deletedMealsMock, loading: false }),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));

import SettingsRecentlyDeleted from "../SettingsRecentlyDeleted";

function makeMeal(overrides: Partial<Meal> & { deletedAtMs?: number }): Meal {
  const { deletedAtMs, ...rest } = overrides;
  return {
    id: "m-1",
    date: "2026-05-19",
    foodName: "Test meal",
    items: [],
    totalCalories: 500,
    totalProtein: 30,
    totalCarbs: 50,
    totalFat: 20,
    confidence: "high",
    createdAt: null,
    deletedAt: deletedAtMs
      ? ({ toDate: () => new Date(deletedAtMs) } as unknown)
      : null,
    ...rest,
  };
}

function renderWith(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(() => {
  restoreMock.mockClear();
  hardDeleteMock.mockClear();
  deletedMealsMock = [];
});

describe("SettingsRecentlyDeleted — empty state", () => {
  it("renders the empty-state copy when no meals are soft-deleted", () => {
    renderWith(<SettingsRecentlyDeleted />);
    expect(screen.getByText(/No recently deleted meals/i)).toBeInTheDocument();
  });
});

describe("SettingsRecentlyDeleted — listing", () => {
  it("renders each soft-deleted meal with calories + relative-time label", () => {
    deletedMealsMock = [
      makeMeal({
        id: "m-1",
        foodName: "Oats",
        totalCalories: 320,
        deletedAtMs: Date.now() - 30_000,
      }),
    ];
    renderWith(<SettingsRecentlyDeleted />);
    expect(screen.getByText("Oats")).toBeInTheDocument();
    // 320 kcal rendered
    expect(screen.getByText(/320/)).toBeInTheDocument();
    // "just now" for sub-minute deletions
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
  });

  it("sorts most-recently-deleted first", () => {
    const now = Date.now();
    deletedMealsMock = [
      makeMeal({
        id: "old",
        foodName: "Older",
        deletedAtMs: now - 6 * 3_600_000,
      }),
      makeMeal({ id: "new", foodName: "Newer", deletedAtMs: now - 60_000 }),
    ];
    renderWith(<SettingsRecentlyDeleted />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Newer");
    expect(items[1]).toHaveTextContent("Older");
  });
});

describe("SettingsRecentlyDeleted — actions", () => {
  it("Restore button calls restoreMeal with the meal id", async () => {
    deletedMealsMock = [makeMeal({ id: "m-1", foodName: "Oats" })];
    renderWith(<SettingsRecentlyDeleted />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Restore Oats/i }));
    });
    expect(restoreMock).toHaveBeenCalledWith("m-1");
    expect(hardDeleteMock).not.toHaveBeenCalled();
  });

  it("Delete button calls hardDeleteMeal with the meal id", async () => {
    deletedMealsMock = [makeMeal({ id: "m-2", foodName: "Toast" })];
    renderWith(<SettingsRecentlyDeleted />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Permanently delete Toast/i })
      );
    });
    expect(hardDeleteMock).toHaveBeenCalledWith("m-2");
    expect(restoreMock).not.toHaveBeenCalled();
  });
});

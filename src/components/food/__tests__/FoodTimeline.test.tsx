/**
 * The diary's list (Pol1): a deleted meal folds away rather than
 * vanishing, and a day with photos lines every name up behind a
 * thumbnail or its slot's tile.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Meal } from "@/hooks/useMeals";

const motionPref = vi.hoisted(() => ({ reduce: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionPref.reduce,
}));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({ useFoodPhotoUrls: () => ({}) }));
vi.mock("@/lib/foodAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import FoodTimeline from "../FoodTimeline";

function meal(id: string, foodName: string, extra: Partial<Meal> = {}): Meal {
  return {
    id,
    date: "2026-10-11",
    foodName,
    items: [],
    totalCalories: 400,
    totalProtein: 20,
    totalCarbs: 40,
    totalFat: 10,
    confidence: "high",
    createdAt: new Date(2026, 9, 11, 12, 30),
    meal: "lunch",
    ...extra,
  } as Meal;
}

function diary(meals: Meal[]) {
  return (
    <FoodTimeline
      meals={meals}
      openRowId={null}
      setOpenRowId={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
    />
  );
}

const rowFor = (name: string) =>
  screen.queryByRole("button", { name: `Edit ${name}` });

beforeEach(() => {
  motionPref.reduce = false;
});

describe("FoodTimeline — a deleted meal folds away (Pol1)", () => {
  it("keeps the row while it folds, then lets it go", async () => {
    // Its exit sat in a presence of its own that unmounted with it, so
    // the row vanished in one frame and the rows below jumped up.
    const soup = meal("m1", "Soup");
    const salad = meal("m2", "Salad", {
      createdAt: new Date(2026, 9, 11, 13, 0),
    });
    const view = render(diary([soup, salad]));
    view.rerender(diary([salad]));
    expect(rowFor("Soup")).not.toBeNull();
    await waitFor(() => expect(rowFor("Soup")).toBeNull());
    expect(rowFor("Salad")).not.toBeNull();
  });

  it("lets it go at once under Reduce Motion", () => {
    motionPref.reduce = true;
    const soup = meal("m1", "Soup");
    const salad = meal("m2", "Salad", {
      createdAt: new Date(2026, 9, 11, 13, 0),
    });
    const view = render(diary([soup, salad]));
    view.rerender(diary([salad]));
    expect(rowFor("Salad")).not.toBeNull();
    expect(rowFor("Soup")).toBeNull();
  });
});

describe("FoodTimeline — thumbnails (Pol1)", () => {
  it("lines every name up on a day with a photo", () => {
    const { container } = render(
      diary([
        meal("m1", "Salmon", {
          photoUrl: "https://example.test/salmon.jpg",
          meal: "dinner",
          createdAt: new Date(2026, 9, 11, 19, 30),
        }),
        meal("m2", "Oats", {
          meal: "breakfast",
          createdAt: new Date(2026, 9, 11, 8, 10),
        }),
      ])
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(
      container.querySelector('[data-slot-tile="breakfast"]')
    ).not.toBeNull();
  });

  it("keeps the compact rows on a day without photos", () => {
    const { container } = render(
      diary([meal("m1", "Oats", { meal: "breakfast" })])
    );
    expect(rowFor("Oats")).not.toBeNull();
    expect(container.querySelector("[data-slot-tile]")).toBeNull();
  });
});

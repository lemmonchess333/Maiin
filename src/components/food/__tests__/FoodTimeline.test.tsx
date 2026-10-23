/**
 * The diary's list (Pol1): a deleted meal folds away rather than
 * vanishing, and a day with photos lines every name up behind a
 * thumbnail or its slot's tile.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Meal } from "@/hooks/useMeals";

const motionPref = vi.hoisted(() => ({ reduce: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionPref.reduce,
}));
const photos = vi.hoisted(() => ({ urls: {} as Record<string, string> }));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({
  useFoodPhotoUrls: (ids: readonly string[]) =>
    Object.fromEntries(
      ids.filter((id) => photos.urls[id]).map((id) => [id, photos.urls[id]])
    ),
}));
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
  photos.urls = {};
});

afterEach(() => document.documentElement.classList.remove("dark"));

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
  it.each(["light", "dark"])(
    "shows a later grouped portion's local photo in %s mode",
    (theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      photos.urls = { scanned: "data:image/jpeg;base64,c2Nhbm5lZA==" };
      const { container } = render(
        diary([
          meal("typed", "Soup"),
          meal("scanned", "Soup"),
          meal("other", "Oats", { meal: "breakfast" }),
        ])
      );
      expect(container.querySelectorAll("img")).toHaveLength(1);
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        photos.urls.scanned
      );
      expect(rowFor("Soup")).not.toBeNull();
      expect(
        container.querySelector('[data-slot-tile="breakfast"]')
      ).not.toBeNull();
    }
  );

  it("prefers the first available local photo across the group before a legacy URL", () => {
    photos.urls = {
      scanned: "data:image/jpeg;base64,c2Nhbm5lZA==",
      later: "data:image/jpeg;base64,bGF0ZXI=",
    };
    const { container } = render(
      diary([
        meal("legacy", "Soup", { photoUrl: "https://example.test/soup.jpg" }),
        meal("scanned", "Soup"),
        meal("later", "Soup"),
      ])
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      photos.urls.scanned
    );
  });

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

describe("FoodTimeline — portion identity", () => {
  const portion = {
    name: "Oats",
    portionSize: "1 bowl",
    calories: 400,
    protein: 20,
    carbs: 40,
    fat: 10,
  };

  it.each([
    { totalCalories: 100 },
    { totalProtein: 30 },
    { items: [{ ...portion, name: "Oats and berries" }] },
    { items: [{ ...portion, portionSize: "2 cups" }] },
  ])(
    "keeps incompatible same-name portions separately editable: %j",
    (change) => {
      const first = meal("small", "Oats", { items: [portion] });
      const second = meal("large", "Oats", { items: [portion], ...change });
      const onEdit = vi.fn();
      render(
        <FoodTimeline
          meals={[first, second]}
          openRowId={null}
          setOpenRowId={() => {}}
          onDelete={() => {}}
          onEdit={onEdit}
        />
      );
      const rows = screen.getAllByRole("button", { name: /^Edit Oats(?:,|$)/ });
      expect(rows).toHaveLength(2);
      rows.forEach((row) => fireEvent.keyDown(row, { key: "Enter" }));
      expect(
        onEdit.mock.calls.map(([group]) => group.meals.map((m: Meal) => m.id))
      ).toEqual([["small"], ["large"]]);
    }
  );

  it.each([false, true])(
    "names each incompatible portion for editing and deletion (Reduce Motion: %s)",
    (reduce) => {
      motionPref.reduce = reduce;
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      const records = [
        meal("small", "Oats", { totalCalories: 100, items: [portion] }),
        meal("plain", "Oats", { items: [portion] }),
        meal("protein", "Oats", { totalProtein: 30, items: [portion] }),
        meal("berries", "Oats", {
          items: [{ ...portion, name: "Oats and berries" }],
        }),
        meal("cups", "Oats", {
          items: [{ ...portion, portionSize: "2 cups" }],
        }),
      ];
      render(
        <FoodTimeline
          meals={records}
          openRowId={null}
          setOpenRowId={() => {}}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      );
      const labels = [
        "Oats, Lunch, 100 kcal, 1 serving, 20 g protein, 40 g carbs, 10 g fat, Oats (1 bowl)",
        "Oats, Lunch, 400 kcal, 1 serving, 20 g protein, 40 g carbs, 10 g fat, Oats (1 bowl)",
        "Oats, Lunch, 400 kcal, 1 serving, 30 g protein, 40 g carbs, 10 g fat, Oats (1 bowl)",
        "Oats, Lunch, 400 kcal, 1 serving, 20 g protein, 40 g carbs, 10 g fat, Oats and berries (1 bowl)",
        "Oats, Lunch, 400 kcal, 1 serving, 20 g protein, 40 g carbs, 10 g fat, Oats (2 cups)",
      ];
      labels.forEach((label) => {
        const edit = screen.getByRole("button", { name: `Edit ${label}` });
        if (reduce) fireEvent.click(edit);
        else fireEvent.keyDown(edit, { key: "Enter" });
      });
      expect(onEdit.mock.calls.map(([group]) => group.meals[0].id)).toEqual(
        records.map((record) => record.id)
      );
      fireEvent.click(
        screen.getByRole("button", { name: `Delete ${labels[3]}` })
      );
      expect(onDelete).toHaveBeenCalledWith(["berries"], "Oats");
    }
  );

  it("keeps identical repeats together despite timestamps and revision metadata", () => {
    const first = meal("first", "Oats", { items: [portion] });
    const second = meal("second", "Oats", {
      items: [{ ...portion }],
      createdAt: new Date(2026, 9, 11, 13, 30),
      revisionCount: 4,
      userEditCount: 2,
    });
    const onEdit = vi.fn();
    render(
      <FoodTimeline
        meals={[first, second]}
        openRowId={null}
        setOpenRowId={() => {}}
        onDelete={() => {}}
        onEdit={onEdit}
      />
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Edit Oats" }), {
      key: "Enter",
    });
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ meals: [first, second] })
    );
  });
});

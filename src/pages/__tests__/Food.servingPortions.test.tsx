import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meal } from "@/hooks/useMeals";

const api = vi.hoisted(() => ({
  meals: [] as Meal[],
  createMealEntry: vi.fn(),
  notifyMealsLogged: vi.fn(),
  saveLog: vi.fn(),
  deleteMeal: vi.fn(),
  editMeal: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
  useAuth: () => ({
    profile: { aiAnalysisEnabled: true },
    updateProfile: vi.fn(),
  }),
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: true }),
}));
vi.mock("@/lib/mealEntry", () => ({
  FOOD_NAME_MAX: 100,
  createMealEntry: api.createMealEntry,
  notifyMealsLogged: api.notifyMealsLogged,
}));
vi.mock("@/hooks/useFirestore", () => ({
  useDailyLogs: () => ({ saveLog: api.saveLog }),
}));
vi.mock("@/hooks/useMeals", () => ({
  useMeals: () => ({
    meals: api.meals,
    error: null,
    loading: false,
    refresh: vi.fn(),
    getMealsForDate: () => api.meals,
    deleteMeal: api.deleteMeal,
    editMeal: api.editMeal,
  }),
}));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({
    favourites: [],
    getTimeRelevant: () => [],
    addFavourite: vi.fn(),
    removeFavourite: vi.fn(),
    restoreFavourite: vi.fn(),
  }),
}));
vi.mock("@/hooks/useEffectiveTargets", () => ({
  useEffectiveTargets: () => ({
    finalTarget: 2200,
    protein: 150,
    carbs: 250,
    fat: 70,
  }),
}));
vi.mock("@/hooks/useScanUsage", () => ({
  useScanUsage: () => ({
    remaining: 10,
    isUnlimited: true,
    loading: false,
    limit: 10,
  }),
}));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({ useFoodPhotoUrls: () => ({}) }));
vi.mock("@/lib/foodPhotoStore", () => ({ sweepFoodPhotosOnce: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("@/components/food/FoodHeroCard", () => ({ default: () => null }));
vi.mock("@/components/food/HeroDrillDownSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/food/FoodConsistencyCard", () => ({
  default: () => null,
}));
vi.mock("@/components/ManualFoodLogger", () => ({
  ManualFoodLogger: () => null,
}));

import Food from "../Food";
import { localDateString } from "@/lib/dateHelpers";

function meal(id: string, calories: number): Meal {
  return {
    id,
    date: localDateString(),
    foodName: "Oats",
    items: [],
    totalCalories: calories,
    totalProtein: 10,
    totalCarbs: 20,
    totalFat: 5,
    meal: "breakfast",
    confidence: "manual",
    createdAt: new Date(),
  };
}
function openPortion(calories: number) {
  const row = screen.getByRole("button", {
    name: new RegExp(`^Edit Oats(?:, Breakfast, ${calories} kcal,.*)?$`),
  });
  fireEvent.keyDown(row, { key: "Enter" });
}
beforeEach(() => {
  vi.clearAllMocks();
  api.createMealEntry.mockResolvedValue({ id: "added" });
  api.saveLog.mockResolvedValue(undefined);
  api.deleteMeal.mockResolvedValue(undefined);
  api.editMeal.mockResolvedValue(undefined);
});
afterEach(() => {
  // Commit pending undo-window deletes so no timer or listener survives a case.
  window.dispatchEvent(new Event("pagehide"));
  cleanup();
});

describe("serving preview and saved portion", () => {
  it("scales the selected 300 kcal entry in place without averaging it with a 100 kcal one", async () => {
    // One entry takes a typed amount, saved on the entry itself rather
    // than as a repeated entry.
    api.meals = [meal("small", 100), meal("large", 300)];
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    openPortion(300);
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "2" },
    });
    expect(screen.getByText(/~ 600 kcal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.editMeal).toHaveBeenCalledOnce());
    const [id, changes] = api.editMeal.mock.calls[0];
    expect(id).toBe("large");
    expect(changes).toMatchObject({ totalCalories: 600, totalProtein: 20 });
    expect(api.createMealEntry).not.toHaveBeenCalled();
  });

  it("fixes 200 g logged to the 150 g eaten, from the entry's own figures", async () => {
    api.meals = [
      {
        ...meal("rice", 260),
        foodName: "Rice",
        items: [
          {
            name: "Rice",
            portionSize: "200g",
            calories: 260,
            protein: 10,
            carbs: 20,
            fat: 5,
          },
        ],
      },
    ];
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Edit Rice" }), {
      key: "Enter",
    });
    fireEvent.change(screen.getByLabelText("Grams"), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.editMeal).toHaveBeenCalledOnce());
    const [, changes] = api.editMeal.mock.calls[0];
    expect(changes.items).toEqual([
      {
        name: "Rice",
        portionSize: "0.75x 200g",
        calories: 195,
        protein: 7.5,
        carbs: 15,
        fat: 3.8,
      },
    ]);
    expect(changes).toMatchObject({
      totalCalories: 195,
      totalProtein: 7.5,
      totalCarbs: 15,
      totalFat: 3.8,
    });
    expect(api.createMealEntry).not.toHaveBeenCalled();
  });

  it("removes one selected portion and keeps the separate smaller portion", async () => {
    api.meals = [
      meal("small", 100),
      meal("large-1", 300),
      meal("large-2", 300),
    ];
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    openPortion(600);
    fireEvent.click(screen.getByLabelText("Decrease servings"));
    expect(screen.getByText(/~ 300 kcal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(api.deleteMeal).toHaveBeenCalledOnce());
    const removed = api.deleteMeal.mock.calls[0][0];
    expect(["large-1", "large-2"]).toContain(removed);
    const retained = api.meals.filter((entry) => entry.id !== removed);
    expect(
      retained
        .filter((entry) => entry.totalCalories === 300)
        .reduce((sum, entry) => sum + entry.totalCalories, 0)
    ).toBe(300);
    expect(retained.find((entry) => entry.id === "small")?.totalCalories).toBe(
      100
    );
    expect(api.createMealEntry).not.toHaveBeenCalled();
  });

  it("keeps bulk macro edits on identical servings and applies them to added portions", async () => {
    api.meals = [meal("first", 300), meal("second", 300)];
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    openPortion(600);
    fireEvent.change(screen.getByLabelText("Per-serving calories"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByText(/~ 750 kcal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(api.editMeal).toHaveBeenCalledTimes(2);
    for (const [, changes] of api.editMeal.mock.calls)
      expect(changes.totalCalories).toBe(250);
    expect(api.createMealEntry.mock.calls[0][1].totalCalories).toBe(250);
  });
});

/**
 * The Home Screen food widget follows Food (Wid1): a meal logged, edited
 * or deleted here changes the calories left the widget draws at once,
 * without Home being drawn. Only Food renders here, and the section the
 * page hands the widgets' bridge is read back as the widget reads it:
 * target minus eaten.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, format } from "date-fns";
import type { Meal } from "@/hooks/useMeals";
import type { HomeWidgetSections } from "@/lib/homeWidgetContract";

const api = vi.hoisted(() => ({
  meals: [] as Meal[],
  sections: [] as HomeWidgetSections[],
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
    profile: { aiAnalysisEnabled: true, sex: "male" },
    updateProfile: vi.fn(),
  }),
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: true }),
}));
vi.mock("@/lib/mealEntry", () => ({
  FOOD_NAME_MAX: 100,
  createMealEntry: vi.fn(),
  notifyMealsLogged: vi.fn(),
}));
vi.mock("@/hooks/useFirestore", () => ({
  useDailyLogs: () => ({ saveLog: vi.fn(async () => undefined) }),
}));
/* The diary as the meals listener delivers it: a meal logged, edited or
   deleted arrives as a new list. */
vi.mock("@/hooks/useMeals", () => ({
  useMeals: () => ({
    meals: api.meals,
    error: null,
    loading: false,
    refresh: vi.fn(),
    getMealsForDate: (date: string) => api.meals.filter((m) => m.date === date),
    deleteMeal: vi.fn(),
    editMeal: vi.fn(),
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
    actualBurn: 0,
    targetInfeasible: false,
    trainingFuel: { eligible: false },
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
vi.mock("@/hooks/useWaterLog", () => ({
  useWaterLog: () => ({
    ml: 0,
    loading: false,
    logWater: vi.fn(() => true),
    drinks: [],
    removeDrink: vi.fn(),
    syncStatus: "",
    retry: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({ useFoodPhotoUrls: () => ({}) }));
vi.mock("@/lib/foodPhotoStore", () => ({ sweepFoodPhotosOnce: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("@/components/food/FoodHeroCard", () => ({ default: () => null }));
vi.mock("@/components/food/FoodConsistencyCard", () => ({
  default: () => null,
}));
vi.mock("@/components/ManualFoodLogger", () => ({
  ManualFoodLogger: () => null,
}));
/* The widgets' bridge: the sections Food hands it, as the plugin would
   merge them into the snapshot. */
vi.mock("@/lib/homeWidgets", () => ({
  writeHomeWidgetSections: vi.fn(async (sections: HomeWidgetSections) => {
    api.sections.push(sections);
    return true;
  }),
}));

import Food from "../Food";
import { localDateString } from "@/lib/dateHelpers";
import { widgetAccount } from "@/lib/homeWidgetContract";

const TODAY = localDateString();

function meal(id: string, calories: number, date = TODAY): Meal {
  return {
    id,
    date,
    foodName: "Soup",
    items: [
      {
        name: "Soup",
        portionSize: "1 bowl",
        calories,
        protein: 20,
        carbs: 30,
        fat: 10,
      },
    ],
    totalCalories: calories,
    totalProtein: 20,
    totalCarbs: 30,
    totalFat: 10,
    meal: "lunch",
    confidence: "manual",
    createdAt: new Date(),
  };
}

function tree(path = "/food") {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/food" element={<Food />} />
      </Routes>
    </MemoryRouter>
  );
}

/** What the food widget would draw from the last food section written. */
function caloriesLeft() {
  const food = [...api.sections].reverse().find((s) => s.food)?.food;
  return food ? food.target - food.eaten : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.meals = [];
  api.sections = [];
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  cleanup();
});

describe("Food keeps the food widget's calories left", () => {
  it("a meal logged on Food changes the written calories left, with Home never drawn", async () => {
    const page = render(tree());
    await waitFor(() => expect(caloriesLeft()).toBe(2200));
    const first = api.sections.at(-1)!;
    expect(first.account).toBe(widgetAccount("u1"));
    expect(first.food).toMatchObject({
      date: TODAY,
      eaten: 0,
      target: 2200,
      protein: 0,
      proteinTarget: 150,
    });
    expect(first.water).toBeUndefined();

    // Lunch is logged: the diary's listener brings the meal.
    api.meals = [meal("m1", 450)];
    page.rerender(tree());
    await waitFor(() => expect(caloriesLeft()).toBe(1750));
    expect(api.sections.at(-1)!.food).toMatchObject({
      eaten: 450,
      protein: 20,
    });
  });

  it("follows an edit and a delete the same way", async () => {
    api.meals = [meal("m1", 450)];
    const page = render(tree());
    await waitFor(() => expect(caloriesLeft()).toBe(1750));
    api.meals = [meal("m1", 300)];
    page.rerender(tree());
    await waitFor(() => expect(caloriesLeft()).toBe(1900));
    api.meals = [];
    page.rerender(tree());
    await waitFor(() => expect(caloriesLeft()).toBe(2200));
  });

  it("writes nothing for a day further back in the diary, which the widget does not draw", async () => {
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
    api.meals = [meal("m1", 450, yesterday)];
    render(tree(`/food?date=${yesterday}`));
    // Let the page settle, then check nothing went to the widgets.
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(api.sections.filter((s) => s.food)).toEqual([]);
  });
});

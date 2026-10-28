/**
 * The Food page's Mob2 wiring: what each new way in or out does once it is
 * on the page, rather than in its component alone.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, format } from "date-fns";
import type { Meal } from "@/hooks/useMeals";

const api = vi.hoisted(() => ({
  meals: [] as Meal[],
  favourites: [] as Array<Record<string, unknown>>,
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
    profile: { aiAnalysisEnabled: true, sex: "male" },
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
    getMealsForDate: (date: string) => api.meals.filter((m) => m.date === date),
    deleteMeal: api.deleteMeal,
    editMeal: api.editMeal,
  }),
}));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({
    favourites: api.favourites,
    getTimeRelevant: () => api.favourites,
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
vi.mock("@/hooks/useFoodPhotoUrls", () => ({ useFoodPhotoUrls: () => ({}) }));
vi.mock("@/lib/foodPhotoStore", () => ({ sweepFoodPhotosOnce: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
/* The hero is a button that opens the breakdown, as the real one is. */
vi.mock("@/components/food/FoodHeroCard", () => ({
  default: ({ onTapDrillDown }: { onTapDrillDown: () => void }) => (
    <button type="button" onClick={onTapDrillDown}>
      Open breakdown
    </button>
  ),
}));
vi.mock("@/components/food/FoodConsistencyCard", () => ({
  default: () => null,
}));
vi.mock("@/components/ManualFoodLogger", () => ({
  ManualFoodLogger: ({ open }: { open: boolean }) =>
    open ? <div data-testid="manual-logger" /> : null,
}));

import Food from "../Food";
import { localDateString } from "@/lib/dateHelpers";

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderFood() {
  return render(
    <MemoryRouter initialEntries={["/food"]}>
      <Routes>
        <Route path="/food" element={<Food />} />
        <Route path="/history" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

function meal(id: string, foodName: string, calories: number): Meal {
  return {
    id,
    date: localDateString(),
    foodName,
    items: [
      {
        name: foodName,
        portionSize: "1 serving",
        calories,
        protein: 10,
        carbs: 20,
        fat: 5,
      },
    ],
    totalCalories: calories,
    totalProtein: 10,
    totalCarbs: 20,
    totalFat: 5,
    meal: "lunch",
    confidence: "manual",
    createdAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.meals = [];
  api.favourites = [];
  api.createMealEntry.mockResolvedValue({ id: "added" });
  api.saveLog.mockResolvedValue(undefined);
  api.editMeal.mockResolvedValue(undefined);
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  cleanup();
});

describe("Food — the breakdown's way to the week", () => {
  it("This week closes the breakdown and opens Analytics on Food", async () => {
    api.meals = [meal("m1", "Oats", 300)];
    renderFood();
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown" }));
    fireEvent.click(await screen.findByRole("button", { name: /^This week/ }));
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe("/history?view=food")
    );
  });
});

/** Eight foods over the last fortnight, the first logged most often. */
function eightRecentFoods(): Meal[] {
  const out: Meal[] = [];
  for (let food = 1; food <= 8; food++) {
    for (let n = 0; n < 10 - food; n++) {
      out.push({
        ...meal(`f${food}-${n}`, `Food ${food}`, 100 + food),
        date: format(addDays(new Date(), -(n + 1)), "yyyy-MM-dd"),
      });
    }
  }
  return out;
}

function quickAddNames(): string[] {
  return screen
    .getAllByRole("button", { name: /^Food \d/ })
    .map((b) => b.textContent?.match(/^Food \d/)?.[0] ?? "");
}

describe("Food — the Quick add list's More row", () => {
  it("shows five, then More opens the rest in the same order", () => {
    api.meals = eightRecentFoods();
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(quickAddNames()).toEqual([
      "Food 1",
      "Food 2",
      "Food 3",
      "Food 4",
      "Food 5",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(quickAddNames()).toEqual([
      "Food 1",
      "Food 2",
      "Food 3",
      "Food 4",
      "Food 5",
      "Food 6",
      "Food 7",
      "Food 8",
    ]);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });

  it("ends with a labelled Quick add row that opens the form", () => {
    api.meals = eightRecentFoods();
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(screen.queryByTestId("manual-logger")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Quick add\b/ }));
    expect(screen.getByTestId("manual-logger")).toBeInTheDocument();
  });

  it("does not offer a nameless Quick add entry back as a food", () => {
    api.meals = [
      ...eightRecentFoods().filter((m) => m.foodName === "Food 1"),
      ...[1, 2, 3, 4].map((n) => ({
        ...meal(`q${n}`, "Quick add", 400),
        date: format(addDays(new Date(), -n), "yyyy-MM-dd"),
      })),
    ];
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(quickAddNames()).toEqual(["Food 1"]);
    expect(screen.queryByText("400 kcal")).toBeNull();
  });

  it("offers no More when five is everything", () => {
    api.meals = eightRecentFoods().filter((m) => /Food [1-5]/.test(m.foodName));
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(quickAddNames()).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });
});

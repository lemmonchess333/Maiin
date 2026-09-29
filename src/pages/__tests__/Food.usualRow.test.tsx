/**
 * Food — the "Your usual" row logs to the meal its heading names.
 *
 * The heading names the selected meal slot, or, with none selected, the
 * slot the hour suggests. Log saved the meal with the selected slot only,
 * so with none selected (as after changing day) the meal carried no slot
 * and the diary filed it by the hour under a different rule: from 15:00
 * to 16:59 the heading said snack time and the meal landed in Lunch.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meal } from "@/hooks/useMeals";

const api = vi.hoisted(() => ({
  createMealEntry: vi.fn(),
  meals: [] as unknown[],
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1", getIdToken: async () => "test-token" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: true }),
}));
vi.mock("@/lib/mealEntry", () => ({
  createMealEntry: api.createMealEntry,
  notifyMealsLogged: vi.fn(),
  undoMealEntries: vi.fn(),
}));
vi.mock("@/hooks/useFirestore", () => ({
  useDailyLogs: () => ({ saveLog: vi.fn() }),
}));
vi.mock("@/hooks/useMeals", () => ({
  useMeals: () => ({
    meals: api.meals,
    error: null,
    loading: false,
    refresh: vi.fn(),
    getMealsForDate: () => [],
    getDailyTotals: () => ({ calories: 0, protein: 0, carbs: 0, fat: 0 }),
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
vi.mock("@/lib/foodPhotoStore", () => ({ sweepFoodPhotosOnce: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/components/food/FoodHeroCard", () => ({ default: () => null }));
vi.mock("@/components/food/HeroDrillDownSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/food/FoodConsistencyCard", () => ({
  default: () => null,
}));
vi.mock("@/components/food/FoodTimeline", () => ({ default: () => null }));
vi.mock("@/components/ManualFoodLogger", () => ({
  ManualFoodLogger: () => null,
}));

import Food from "../Food";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

const snack = (daysAgo: number): Meal => ({
  id: `yoghurt-${daysAgo}`,
  date: localDateString(addLocalDays(new Date(), -daysAgo)),
  foodName: "Greek yoghurt",
  meal: "snacks",
  confidence: "manual",
  createdAt: null,
  totalCalories: 150,
  totalProtein: 15,
  totalCarbs: 8,
  totalFat: 6,
  items: [
    {
      name: "Greek yoghurt",
      portionSize: "170 g",
      calories: 150,
      protein: 15,
      carbs: 8,
      fat: 6,
    },
  ],
});

beforeEach(() => {
  /* Mid-afternoon, when the hour suggests snack time and the diary's
     own rule files an unslotted meal under Lunch. Only Date is faked,
     and the day comes from the clock, so the pin cannot expire. */
  vi.useFakeTimers({ toFake: ["Date"] });
  const afternoon = new Date();
  afternoon.setHours(15, 30, 0, 0);
  vi.setSystemTime(afternoon);
  api.createMealEntry.mockResolvedValue({ id: "m1" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  api.meals = [];
});

describe("Food — the usual row", () => {
  it("logs to the slot its heading names when no meal slot is selected", async () => {
    // Snacks on the three days before yesterday: a usual for yesterday.
    api.meals = [2, 3, 4].map(snack);
    const yesterday = localDateString(addLocalDays(new Date(), -1));
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    // Back-filling yesterday: changing day clears the selected slot.
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    const slots = screen.getByRole("radiogroup", { name: "Add to meal" });
    expect(within(slots).queryByRole("radio", { checked: true })).toBeNull();

    const row = screen.getByRole("group", {
      name: "Your usual at snack time",
    });
    fireEvent.click(within(row).getByRole("button", { name: "Log" }));
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        date: yesterday,
        foodName: "Greek yoghurt",
        meal: "snacks",
      }),
      expect.any(String)
    );
  });
});

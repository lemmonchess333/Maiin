/**
 * The Food page's Mob2 wiring: what each new way in or out does once it is
 * on the page, rather than in its component alone.
 */
import {
  act,
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
  /** The meal the clock says. Null leaves it to the real rule. */
  openingMeal: null as "breakfast" | "lunch" | "snacks" | "dinner" | null,
  /** The hour the page's clock reads, and who is listening for it. */
  hour: 12,
  hourListeners: new Set<() => void>(),
  /** The hours the pantry was asked for, in order. */
  pantryHours: [] as number[],
  favourites: [] as Array<Record<string, unknown>>,
  waterDates: [] as Array<string | undefined>,
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
/* The meal a log goes to is the one the clock says. A test of what
   follows from the meal sets it, so it does not depend on the hour the
   suite runs at; `clockMovesTo` then moves the page's clock, which is
   the only thing that changes the meal. */
vi.mock("@/hooks/useLocalHour", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useLocalHour: () =>
      useSyncExternalStore(
        (listener) => {
          api.hourListeners.add(listener);
          return () => api.hourListeners.delete(listener);
        },
        () => api.hour
      ),
  };
});
vi.mock("@/components/food/mealConstants", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/food/mealConstants")>();
  return {
    ...actual,
    inferMostLikelyMealSlot: (hour: number) =>
      api.openingMeal ?? actual.inferMostLikelyMealSlot(hour),
  };
});
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({
    favourites: api.favourites,
    getTimeRelevant: (hour: number) => {
      api.pantryHours.push(hour);
      return api.favourites;
    },
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
vi.mock("@/hooks/useWaterLog", () => ({
  useWaterLog: (date?: string) => {
    api.waterDates.push(date);
    return {
      ml: 750,
      loading: false,
      logWater: vi.fn(() => true),
      drinks: [],
      removeDrink: vi.fn(),
      syncStatus: "",
      retry: vi.fn(),
    };
  },
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
  api.openingMeal = null;
  api.hour = 12;
  api.pantryHours = [];
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

/** The clock comes round to another meal while the page is open. */
function clockMovesTo(meal: "breakfast" | "lunch" | "dinner") {
  api.openingMeal = meal;
  act(() => {
    api.hour = { breakfast: 8, lunch: 13, dinner: 19 }[meal];
    api.hourListeners.forEach((notify) => notify());
  });
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

/**
 * Food11 call 7: the Quick add list is ranked for the meal being added
 * to. Food 1 is the most logged food, always at lunch; Food 2 is logged
 * a third as often, always at breakfast.
 */
describe("Food — the Quick add list follows the meal the clock says", () => {
  function lunchAndBreakfastFoods(): Meal[] {
    const out: Meal[] = [];
    for (let n = 1; n <= 9; n++) {
      out.push({
        ...meal(`lunch-${n}`, "Food 1", 600),
        date: format(addDays(new Date(), -n), "yyyy-MM-dd"),
        meal: "lunch",
      });
    }
    for (let n = 1; n <= 3; n++) {
      out.push({
        ...meal(`breakfast-${n}`, "Food 2", 300),
        date: format(addDays(new Date(), -n), "yyyy-MM-dd"),
        meal: "breakfast",
      });
    }
    return out;
  }

  it("leads with what is logged at breakfast when adding to breakfast", () => {
    api.meals = lunchAndBreakfastFoods();
    api.openingMeal = "breakfast";
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    // The lunch food is logged three times as often, and still offered.
    expect(quickAddNames()).toEqual(["Food 2", "Food 1"]);
  });

  it("leads with what is logged at lunch when adding to lunch", () => {
    api.meals = lunchAndBreakfastFoods();
    api.openingMeal = "lunch";
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(quickAddNames()).toEqual(["Food 1", "Food 2"]);
  });

  it("ranks afresh when the clock moves to another meal, and back again", () => {
    api.meals = lunchAndBreakfastFoods();
    api.openingMeal = "breakfast";
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(quickAddNames()).toEqual(["Food 2", "Food 1"]);
    clockMovesTo("lunch");
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(quickAddNames()).toEqual(["Food 1", "Food 2"]);
    clockMovesTo("breakfast");
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    expect(quickAddNames()).toEqual(["Food 2", "Food 1"]);
  });

  it("files a log under the meal the clock says, and under the next meal once the clock has moved", async () => {
    api.meals = lunchAndBreakfastFoods();
    api.openingMeal = "breakfast";
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    fireEvent.click(screen.getAllByRole("button", { name: /^Food \d/ })[0]);
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledTimes(1));
    expect(api.createMealEntry.mock.calls[0][1]).toMatchObject({
      meal: "breakfast",
    });
    clockMovesTo("dinner");
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    fireEvent.click(screen.getAllByRole("button", { name: /^Food \d/ })[0]);
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledTimes(2));
    expect(api.createMealEntry.mock.calls[1][1]).toMatchObject({
      meal: "dinner",
    });
  });

  it("asks the pantry for the meal's time of day, not the clock's", () => {
    api.openingMeal = "breakfast";
    renderFood();
    expect(new Set(api.pantryHours)).toEqual(new Set([8]));
    api.pantryHours = [];
    clockMovesTo("dinner");
    expect(api.pantryHours.at(-1)).toBe(19);
  });
});

function dish(): Meal {
  return {
    ...meal("dish", "Chicken, Rice, Oil", 645),
    items: [
      {
        name: "Chicken",
        portionSize: "200g",
        calories: 330,
        protein: 62,
        carbs: 0,
        fat: 7,
      },
      {
        name: "Rice",
        portionSize: "150g",
        calories: 195,
        protein: 4,
        carbs: 42,
        fat: 0,
      },
      {
        name: "Oil",
        portionSize: "1 tbsp",
        calories: 120,
        protein: 0,
        carbs: 0,
        fat: 14,
      },
    ],
    totalProtein: 66,
    totalCarbs: 42,
    totalFat: 21,
  };
}

function openRow(name: RegExp) {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });
}

describe("Food — water for the day on screen", () => {
  it("draws the water row under the diary for the day shown, past days too", async () => {
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
    api.waterDates = [];
    render(
      <MemoryRouter initialEntries={[`/food?date=${yesterday}`]}>
        <Routes>
          <Route path="/food" element={<Food />} />
        </Routes>
      </MemoryRouter>
    );
    // The row loads with the diary, after the meals.
    expect(
      await screen.findByRole("heading", { name: "Water" })
    ).toBeInTheDocument();
    expect(screen.getByText(/ml logged/)).toHaveTextContent("750 ml logged");
    expect(api.waterDates.at(-1)).toBe(yesterday);
  });
});

describe("Food — copy an entry to another day", () => {
  it("logs a row from a past day to today, in its own slot", async () => {
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
    api.meals = [{ ...meal("old", "Chicken & rice", 650), date: yesterday }];
    render(
      <MemoryRouter initialEntries={[`/food?date=${yesterday}`]}>
        <Routes>
          <Route path="/food" element={<Food />} />
        </Routes>
      </MemoryRouter>
    );
    openRow(/^Edit Chicken & rice/);
    fireEvent.click(
      screen.getByRole("button", { name: "Copy to another day" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Log to Today" })
    );
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    const [, entry] = api.createMealEntry.mock.calls[0];
    expect(entry).toMatchObject({
      date: localDateString(),
      meal: "lunch",
      foodName: "Chicken & rice",
      totalCalories: 650,
      confidence: "copy",
    });
    expect(api.notifyMealsLogged).toHaveBeenCalledWith(
      "u1",
      ["added"],
      "Copied Chicken & rice to today",
      { path: "copy" }
    );
  });
});

describe("Food — one food of an entry of several", () => {
  it("writes the edited foods, their sum and the name they make", async () => {
    api.meals = [dish()];
    renderFood();
    openRow(/^Edit Chicken, Rice, Oil/);
    fireEvent.change(screen.getByLabelText("Grams of Chicken"), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Oil" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.editMeal).toHaveBeenCalledOnce());
    const [id, changes] = api.editMeal.mock.calls[0];
    expect(id).toBe("dish");
    expect(changes.items.map((i: { name: string }) => i.name)).toEqual([
      "Chicken",
      "Rice",
    ]);
    expect(changes).toMatchObject({
      foodName: "Chicken, Rice",
      totalCalories: 442.5,
      totalProtein: 50.5,
      totalCarbs: 42,
      totalFat: 5.3,
    });
    expect(api.createMealEntry).not.toHaveBeenCalled();
  });
});

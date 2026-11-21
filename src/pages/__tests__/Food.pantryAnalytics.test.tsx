/**
 * The Food page's pantry events say what happened, never which food.
 *
 * A saved food's id is its name, lower-cased with underscores
 * (`useFoodFavourites`' `makeKey`), so a typed meal "Chicken and rice"
 * logged twice is `chicken_and_rice`. Sending that id to Google Analytics
 * sent the name. These tests catch every event at `emit`, before
 * `analyticsRedaction` strips anything, so they hold the call sites
 * themselves: tapping a pantry row, picking one from the typeahead and
 * long-pressing one away.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";

const api = vi.hoisted(() => ({
  favourites: [] as Array<Record<string, unknown>>,
  emitted: [] as Array<{
    surface: string;
    event: string;
    metadata: Record<string, unknown>;
  }>,
  createMealEntry: vi.fn(),
  removeFavourite: vi.fn(),
}));
vi.mock("@/lib/analyticsClient", () => ({
  emit: (surface: string, event: string, metadata: Record<string, unknown>) =>
    api.emitted.push({ surface, event, metadata }),
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
  undoMealEntries: vi.fn(),
  notifyMealsLogged: vi.fn(),
}));
vi.mock("@/hooks/useFirestore", () => ({
  useDailyLogs: () => ({ saveLog: vi.fn() }),
}));
vi.mock("@/hooks/useMeals", () => ({
  useMeals: () => ({
    meals: [],
    error: null,
    loading: false,
    refresh: vi.fn(),
    getMealsForDate: () => [],
    deleteMeal: vi.fn(),
    editMeal: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({
    favourites: api.favourites,
    getTimeRelevant: () => api.favourites,
    addFavourite: vi.fn(),
    removeFavourite: api.removeFavourite,
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
vi.mock("@/components/food/FoodTimeline", () => ({ default: () => null }));
vi.mock("@/components/ManualFoodLogger", () => ({
  ManualFoodLogger: () => null,
}));

import Food from "../Food";

/** A typed meal logged often enough to be saved: its id is its name. */
const CHICKEN = {
  id: "chicken_and_rice",
  name: "Chicken and rice",
  calories: 620,
  protein: 45,
  carbs: 70,
  fat: 14,
  servingSize: "1 bowl",
  useCount: 3,
  timeOfDay: "any",
  source: "nl",
  lastUsed: Timestamp.fromMillis(0),
};

function renderFood() {
  return render(
    <MemoryRouter initialEntries={["/food"]}>
      <Routes>
        <Route path="/food" element={<Food />} />
      </Routes>
    </MemoryRouter>
  );
}

const pantryEvents = () =>
  api.emitted.filter((e) => e.event.startsWith("food_pantry_"));

/** Every value an event carried, as one lower-cased string. */
const carried = (events: typeof api.emitted) =>
  JSON.stringify(events.map((e) => e.metadata)).toLowerCase();

function expectNoFoodName(events: typeof api.emitted) {
  const sent = carried(events);
  expect(sent).not.toContain("chicken");
  expect(sent).not.toContain("rice");
}

beforeEach(() => {
  vi.clearAllMocks();
  api.emitted = [];
  api.favourites = [{ ...CHICKEN }];
  api.createMealEntry.mockResolvedValue({ id: "added" });
  api.removeFavourite.mockResolvedValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ products: [] })))
  );
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  cleanup();
  vi.unstubAllGlobals();
});

describe("Food: the pantry's events carry no food name", () => {
  it("tapping a saved food sends the tap and where the row came from", async () => {
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    fireEvent.click(screen.getByRole("button", { name: /^Chicken and rice/ }));
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalled());

    const taps = pantryEvents().filter(
      (e) => e.event === "food_pantry_chip_tapped"
    );
    expect(taps).toEqual([
      {
        surface: "food",
        event: "food_pantry_chip_tapped",
        metadata: { fromPantry: true },
      },
    ]);
    expectNoFoodName(api.emitted);
  });

  it("picking a saved food from the typeahead sends its use count, not its id", async () => {
    renderFood();
    const input = screen.getByLabelText("What did you eat");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "chick" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /^Chicken and rice/ })
    );
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalled());

    expect(
      pantryEvents().find((e) => e.event === "food_pantry_typeahead_selected")
        ?.metadata
    ).toEqual({ useCount: 3 });
    expectNoFoodName(api.emitted);
  });

  it("long-pressing a saved food away sends its use count, not its id", async () => {
    renderFood();
    fireEvent.focus(screen.getByLabelText("What did you eat"));
    fireEvent.pointerDown(
      screen.getByRole("button", { name: /^Chicken and rice/ }),
      { clientX: 10, clientY: 10 }
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    await waitFor(() =>
      expect(api.removeFavourite).toHaveBeenCalledWith("chicken_and_rice")
    );

    expect(
      pantryEvents().find((e) => e.event === "food_pantry_chip_removed")
        ?.metadata
    ).toEqual({ useCount: 3 });
    expectNoFoodName(api.emitted);
  });
});

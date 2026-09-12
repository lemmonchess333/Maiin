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

const api = vi.hoisted(() => ({
  createMealEntry: vi.fn(),
  notifyMealsLogged: vi.fn(),
  addFavourite: vi.fn(),
  saveLog: vi.fn(),
  mealsState: { error: null as string | null, loading: false },
  refreshMeals: vi.fn(),
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
  notifyMealsLogged: api.notifyMealsLogged,
}));
vi.mock("@/hooks/useFirestore", () => ({
  useDailyLogs: () => ({ saveLog: api.saveLog }),
}));
vi.mock("@/hooks/useMeals", () => ({
  useMeals: () => ({
    meals: [],
    ...api.mealsState,
    refresh: api.refreshMeals,
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
    addFavourite: api.addFavourite,
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
import { localDateString } from "@/lib/dateHelpers";

const parsedMeal = {
  items: [
    {
      name: "Eggs",
      portionSize: "2 eggs",
      calories: 140,
      protein: 12,
      carbs: 0,
      fat: 10,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.createMealEntry.mockResolvedValue({ id: "m1" });
  api.saveLog.mockResolvedValue(undefined);
  api.mealsState = { error: null, loading: false };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function startAnalysis() {
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetchMock = vi.fn((url: string) =>
    url.includes("analyzeFoodText")
      ? response
      : Promise.resolve({ ok: true, json: async () => ({ products: [] }) })
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter>
      <Food />
    </MemoryRouter>
  );
  const input = screen.getByLabelText("What did you eat");
  fireEvent.change(input, { target: { value: "2 eggs" } });
  fireEvent.click(screen.getByLabelText("Log meal"));
  return {
    input,
    fetchMock,
    finish: async () => {
      await act(async () => {
        resolve({ ok: true, json: async () => parsedMeal } as Response);
      });
      await waitFor(() => expect(api.notifyMealsLogged).toHaveBeenCalledOnce());
    },
  };
}

describe("food text logging", () => {
  it.each(["a new meal", "the same meal retyped", "another diary day"])(
    "preserves the newer draft for %s when an earlier analysis finishes",
    async (scenario) => {
      const date = localDateString();
      const { input, finish } = startAnalysis();
      expect(screen.getByLabelText("Log meal")).toBeDisabled();
      if (scenario === "another diary day") {
        fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
      }
      fireEvent.change(input, { target: { value: "" } });
      const next = scenario === "the same meal retyped" ? "2 eggs" : "toast";
      fireEvent.change(input, { target: { value: next } });
      await finish();
      expect(input).toHaveValue(next);
      expect(screen.getByLabelText("Log meal")).toBeEnabled();
      expect(api.createMealEntry).toHaveBeenCalledOnce();
      expect(api.createMealEntry).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ date, foodName: "Eggs" })
      );
    }
  );

  it("clears the submitted draft when the user has not started another one", async () => {
    const { input, finish } = startAnalysis();
    await finish();
    expect(input).toHaveValue("");
    expect(api.createMealEntry).toHaveBeenCalledOnce();
  });

  it("falls back to local food parsing after a stalled request and preserves the next draft", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    const input = screen.getByLabelText("What did you eat");
    fireEvent.change(input, { target: { value: "2 eggs" } });
    fireEvent.click(screen.getByLabelText("Log meal"));
    fireEvent.change(input, { target: { value: "toast" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(api.createMealEntry).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Log meal")).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(api.createMealEntry).toHaveBeenCalledOnce();
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        confidence: "nl-parse",
        totalCalories: expect.any(Number),
        items: [
          expect.objectContaining({ name: expect.stringMatching(/egg/i) }),
        ],
      })
    );
    expect(input).toHaveValue("toast");
    expect(screen.getByLabelText("Log meal")).toBeEnabled();
  });
});

describe("food diary read recovery", () => {
  it("shows Retry instead of an empty diary, and keeps date navigation available", () => {
    api.mealsState.error = "failed";
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load your food diary."
    );
    expect(screen.queryByLabelText("What did you eat")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(api.refreshMeals).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /previous day/i })).toBeEnabled();
  });
  it("keeps the selected date accessible while loading", () => {
    api.mealsState.loading = true;
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /previous day/i })).toBeEnabled();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(api.saveLog).not.toHaveBeenCalled();
  });
});

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreRealTimers } from "@/test/fakeTimers";
import type { Meal } from "@/hooks/useMeals";

const api = vi.hoisted(() => ({
  createMealEntry: vi.fn(),
  notifyMealsLogged: vi.fn(),
  addFavourite: vi.fn(),
  saveLog: vi.fn(),
  diaryMeals: [] as Meal[],
  mealsState: {
    error: null as string | null,
    loading: false,
    serverConfirmed: true,
  },
  refreshMeals: vi.fn(),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1", getIdToken: async () => "test-token" } },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  // The guide's composer hint keeps its seen flag per account.
  useUidForStorageKey: () => "u1",
  // The AI permission gate reads the answer from the profile; this account
  // has already said yes (aiConsentGate.test.tsx covers the question).
  useAuth: () => ({
    profile: { aiAnalysisEnabled: true },
    updateProfile: vi.fn(async () => ({ ok: true })),
  }),
}));
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
    meals: api.diaryMeals,
    ...api.mealsState,
    refresh: api.refreshMeals,
    getMealsForDate: (date: string) =>
      api.diaryMeals.filter((meal) => meal.date === date),
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
  api.diaryMeals = [];
  api.mealsState = { error: null, loading: false, serverConfirmed: true };
});
afterEach(async () => {
  await restoreRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

function startAnalysis(meal: unknown = parsedMeal) {
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
        resolve({ ok: true, json: async () => meal } as Response);
      });
      await waitFor(() => expect(api.notifyMealsLogged).toHaveBeenCalledOnce());
    },
  };
}

function submitLocalText(text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [], products: [] }),
    }))
  );
  render(
    <MemoryRouter>
      <Food />
    </MemoryRouter>
  );
  const input = screen.getByLabelText("What did you eat");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByLabelText("Log meal"));
  return input;
}

describe("food text logging", () => {
  describe("explicit quantities need a compatible serving reference", () => {
    it.each([
      ["50g milk", "50g", "150ml milk", "150ml", 94, 5, 8, 5],
      ["500g milk", "500g", "150ml milk", "150ml", 94, 5, 8, 5],
      ["5ml olive oil", "5ml", "14g olive oil", "14g", 119, 0, 0, 14],
      ["50ml olive oil", "50ml", "14g olive oil", "14g", 119, 0, 0, 14],
    ] as const)(
      "keeps %s for correction instead of saving a differently measured serving",
      async (
        text,
        amount,
        corrected,
        portion,
        calories,
        protein,
        carbs,
        fat
      ) => {
        const warning = vi.spyOn(toast, "warning");
        try {
          const input = submitLocalText(text);
          // Wait for the real local parser's decision, including the wrong
          // save on an unfixed implementation, rather than passing too early.
          await waitFor(() =>
            expect(
              warning.mock.calls.length + api.createMealEntry.mock.calls.length
            ).toBeGreaterThan(0)
          );
          expect(api.createMealEntry).not.toHaveBeenCalled();
          expect(api.addFavourite).not.toHaveBeenCalled();
          expect(api.notifyMealsLogged).not.toHaveBeenCalled();
          expect(warning).toHaveBeenCalledWith(
            expect.stringMatching(/nothing (was )?logged/i),
            expect.objectContaining({
              id: "food-nl-warning",
              action: expect.objectContaining({ label: "Edit description" }),
            })
          );
          expect(
            String(warning.mock.calls.at(-1)?.[0]).toLowerCase()
          ).toContain(amount);
          expect(input).toHaveValue(text);
          expect(screen.getByLabelText("Log meal")).toBeEnabled();

          // A supported correction must still save the exact measured
          // payload; rejecting every quantity would fail this control.
          fireEvent.change(input, { target: { value: corrected } });
          fireEvent.click(screen.getByLabelText("Log meal"));
          await waitFor(() =>
            expect(api.notifyMealsLogged).toHaveBeenCalledOnce()
          );
          expect(api.createMealEntry).toHaveBeenCalledOnce();
          expect(api.createMealEntry).toHaveBeenCalledWith(
            "u1",
            expect.objectContaining({
              confidence: "nl-parse",
              foodName: corrected,
              totalCalories: calories,
              totalProtein: protein,
              totalCarbs: carbs,
              totalFat: fat,
              items: [
                {
                  name: corrected,
                  portionSize: portion,
                  calories,
                  protein,
                  carbs,
                  fat,
                },
              ],
            })
          );
          expect(input).toHaveValue("");
        } finally {
          warning.mockRestore();
        }
      }
    );

    it.each([
      ["150ml milk", "150ml", 94, 5, 8, 5],
      ["14g olive oil", "14g", 119, 0, 0, 14],
    ] as const)(
      "saves supported %s with its matching portion and macros",
      async (text, portion, calories, protein, carbs, fat) => {
        const warning = vi.spyOn(toast, "warning");
        try {
          submitLocalText(text);
          await waitFor(() =>
            expect(api.notifyMealsLogged).toHaveBeenCalledOnce()
          );
          expect(api.createMealEntry).toHaveBeenCalledWith(
            "u1",
            expect.objectContaining({
              confidence: "nl-parse",
              foodName: text,
              totalCalories: calories,
              totalProtein: protein,
              totalCarbs: carbs,
              totalFat: fat,
              items: [
                {
                  name: text,
                  portionSize: portion,
                  calories,
                  protein,
                  carbs,
                  fat,
                },
              ],
            })
          );
          expect(warning).not.toHaveBeenCalled();
        } finally {
          warning.mockRestore();
        }
      }
    );

    it("keeps the whole meal when only one measured food lacks a compatible reference", async () => {
      const warning = vi.spyOn(toast, "warning");
      try {
        const text = "2 eggs, 50g milk";
        const input = submitLocalText(text);
        await waitFor(() =>
          expect(
            warning.mock.calls.length + api.createMealEntry.mock.calls.length
          ).toBeGreaterThan(0)
        );
        expect(api.createMealEntry).not.toHaveBeenCalled();
        expect(api.addFavourite).not.toHaveBeenCalled();
        expect(api.notifyMealsLogged).not.toHaveBeenCalled();
        expect(String(warning.mock.calls.at(-1)?.[0])).toMatch(
          /nothing (was )?logged/i
        );
        expect(input).toHaveValue(text);

        fireEvent.change(input, { target: { value: "2 eggs, 150ml milk" } });
        fireEvent.click(screen.getByLabelText("Log meal"));
        await waitFor(() =>
          expect(api.notifyMealsLogged).toHaveBeenCalledOnce()
        );
        expect(api.createMealEntry).toHaveBeenCalledOnce();
        expect(api.createMealEntry).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({
            confidence: "nl-parse",
            totalCalories: 250,
            totalProtein: 17,
            totalCarbs: 10,
            totalFat: 15,
            items: expect.arrayContaining([
              expect.objectContaining({ name: "Eggs (x2)", calories: 156 }),
              expect.objectContaining({
                name: "150ml milk",
                portionSize: "150ml",
                calories: 94,
              }),
            ]),
          })
        );
      } finally {
        warning.mockRestore();
      }
    });
  });

  it.each([
    "chicken with tahini",
    "chicken and tahini",
    "creatine with tahini",
    "xylophone",
  ])(
    "keeps %s for correction without saving an incomplete meal",
    async (text) => {
      const warning = vi.spyOn(toast, "warning");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({ items: [], products: [] }),
        }))
      );
      render(
        <MemoryRouter>
          <Food />
        </MemoryRouter>
      );
      const input = screen.getByLabelText("What did you eat");
      fireEvent.change(input, { target: { value: text } });
      fireEvent.click(screen.getByLabelText("Log meal"));
      await waitFor(() =>
        expect(warning).toHaveBeenCalledWith(
          expect.stringMatching(/couldn't find macros for/i),
          expect.objectContaining({
            id: "food-nl-warning",
            action: expect.objectContaining({ label: "Edit description" }),
          })
        )
      );
      expect(warning.mock.calls.at(-1)?.[0]).toMatch(/nothing (was )?logged/i);
      expect(api.createMealEntry).not.toHaveBeenCalled();
      expect(api.addFavourite).not.toHaveBeenCalled();
      expect(api.notifyMealsLogged).not.toHaveBeenCalled();
      expect(input).toHaveValue(text);
      expect(screen.getByLabelText("Log meal")).toBeEnabled();

      fireEvent.change(input, { target: { value: "chicken with rice" } });
      fireEvent.click(screen.getByLabelText("Log meal"));
      await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
      expect(api.createMealEntry).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({
          foodName: "Chicken with rice",
          totalCalories: 448,
          totalCarbs: 45,
        })
      );
      warning.mockRestore();
    }
  );

  it("saves a measured base and its side together, including the typed portion in the name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [], products: [] }),
      }))
    );
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("What did you eat"), {
      target: { value: "200g chicken with rice" },
    });
    fireEvent.click(screen.getByLabelText("Log meal"));
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        foodName: "200g chicken with rice",
        totalCalories: 531,
        totalProtein: 67,
        totalCarbs: 45,
      })
    );
  });

  it("logs a recognized zero-calorie food without warning that it is unknown", async () => {
    const warning = vi.spyOn(toast, "warning");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [], products: [] }),
      }))
    );
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("What did you eat"), {
      target: { value: "creatine" },
    });
    fireEvent.click(screen.getByLabelText("Log meal"));
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        totalCalories: 0,
      })
    );
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });

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
    /* Pin the clock to the middle of the day before advancing it.
       `Food.tsx` reads `todayStr` from the shared day key, which checks
       the clock every 30 seconds, and this test advances fake timers by
       50 seconds in total. Run it inside the last minute before local
       midnight and the rollover flips `selectedDate`, whose own guard clears the
       typed draft on purpose — so the draft assertion at the end fails
       on the calendar rather than on the behaviour it is about.
       Measured: 23:59:20 fails, 12:00 passes, same code.

       Midday is derived from the current date rather than written as a
       literal, so the pin cannot expire the way a dated fixture would
       and it still moves under a shifted clock. */
    const middayToday = new Date();
    middayToday.setHours(12, 0, 0, 0);
    vi.setSystemTime(middayToday);
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

/* A meal typed and not logged survives a tab switch (`foodDraft`), and a
   meal the words could not be read into offers the manual form. */
describe("a typed meal, kept and recovered", () => {
  beforeEach(() => sessionStorage.clear());

  it("comes back after leaving the page before it was logged", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ products: [] }) }))
    );
    const first = render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("What did you eat"), {
      target: { value: "2 eggs and toast" },
    });
    first.unmount();
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("What did you eat")).toHaveValue(
      "2 eggs and toast"
    );
  });

  it("offers to log it manually when a food can't be read", async () => {
    const warning = vi.spyOn(toast, "warning");
    try {
      submitLocalText("xylophone");
      await waitFor(() =>
        expect(warning).toHaveBeenCalledWith(
          expect.stringMatching(/couldn't find macros for/i),
          expect.objectContaining({
            cancel: expect.objectContaining({ label: "Log manually" }),
          })
        )
      );
    } finally {
      warning.mockRestore();
    }
  });
});

describe("a typed meal's figures as the model writes them", () => {
  /* The text path mapped the model's macros raw: "~140 kcal" was not a
     number, so the meal was blocked, and a protein it left out made the
     saved total NaN (stripUndefined keeps NaN), read back as 0. */
  const eggs = (fields: Record<string, unknown>) => ({
    items: [{ name: "Eggs", portionSize: "2 eggs", ...fields }],
  });

  it("reads a figure written with words and units, and a missing macro as 0", async () => {
    const { finish } = startAnalysis(
      eggs({ calories: "~140 kcal", protein: "12g", carbs: 0 })
    );
    await finish();
    const saved = api.createMealEntry.mock.calls[0][1];
    expect(saved).toMatchObject({
      confidence: "ai-parse",
      totalCalories: 140,
      totalProtein: 12,
      totalFat: 0,
    });
    expect(Number.isNaN(saved.totalFat)).toBe(false);
  });

  it("reads the meal locally when the model gave no calorie figure", async () => {
    const { finish } = startAnalysis(
      eggs({ calories: "about a hundred", protein: 12, carbs: 0, fat: 10 })
    );
    await finish();
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ confidence: "nl-parse" })
    );
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

describe("food daily log consistency", () => {
  const mealOn = (date: string): Meal => ({
    id: "last-meal",
    date,
    foodName: "Eggs",
    items: [],
    totalCalories: 140,
    totalProtein: 12,
    totalCarbs: 1,
    totalFat: 10,
    confidence: "high",
    createdAt: null,
  });
  const diary = () => (
    <MemoryRouter>
      <Food />
    </MemoryRouter>
  );

  it("clears the meal count after the last meal is deleted, without resetting other log fields", async () => {
    const date = localDateString();
    api.diaryMeals = [mealOn(date)];
    const view = render(diary());
    await waitFor(() =>
      expect(api.saveLog).toHaveBeenCalledWith({ date, meals: 1 })
    );
    api.saveLog.mockClear();

    api.diaryMeals = [];
    view.rerender(diary());

    await waitFor(() =>
      expect(api.saveLog).toHaveBeenCalledWith({ date, meals: 0 })
    );
  });

  it("does not clear a count from an empty cached snapshot before the server confirms it", async () => {
    api.mealsState.serverConfirmed = false;
    const view = render(diary());
    expect(api.saveLog).not.toHaveBeenCalled();

    api.mealsState.serverConfirmed = true;
    view.rerender(diary());
    await waitFor(() =>
      expect(api.saveLog).toHaveBeenCalledWith({
        date: localDateString(),
        meals: 0,
      })
    );
  });

  it("waits for the selected date's read while switching to an empty day", async () => {
    api.diaryMeals = [mealOn(localDateString())];
    const view = render(diary());
    await waitFor(() => expect(api.saveLog).toHaveBeenCalled());
    api.saveLog.mockClear();

    api.mealsState.loading = true;
    api.mealsState.serverConfirmed = false;
    fireEvent.click(screen.getByRole("button", { name: /previous day/i }));
    expect(api.saveLog).not.toHaveBeenCalled();

    api.mealsState.loading = false;
    api.mealsState.serverConfirmed = true;
    view.rerender(diary());
    const previous = new Date();
    previous.setDate(previous.getDate() - 1);
    await waitFor(() =>
      expect(api.saveLog).toHaveBeenCalledWith({
        date: localDateString(previous),
        meals: 0,
      })
    );
  });
});

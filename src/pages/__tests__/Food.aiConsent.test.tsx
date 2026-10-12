/**
 * Permission before a typed meal goes to Google (App Review 5.1.2(i)).
 *
 * A Pro account's typed meal is sent to analyzeFoodText (Gemini) only
 * once the person has said yes. Driven through the real Food page and the
 * real `useAiConsent`, with the stored answer in a mocked auth context and
 * `fetch` stubbed, so "sent" means a request to analyzeFoodText was made:
 *
 *   not asked → Log asks first; nothing is sent while the question is up
 *   Allow     → stored as true, the meal goes to Gemini and is logged
 *   Not now   → stored as false, nothing is sent, and the meal is read
 *               on the phone (as a free account's is) and logged
 *   closed    → nothing stored, sent or logged; the draft stays
 *   off       → never asked, never sent, logged from the phone
 */
import {
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
}));
const auth = vi.hoisted(() => ({
  profile: {} as { aiAnalysisEnabled?: boolean },
  updateProfile: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1", getIdToken: async () => "test-token" } },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
  useAuth: () => ({
    profile: auth.profile,
    updateProfile: auth.updateProfile,
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
    meals: [],
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

const QUESTION = "Send food to Google for analysis?";
const AI_MEAL = {
  foodName: "Eggs",
  items: [
    {
      name: "Scrambled eggs",
      portionSize: "2 eggs",
      calories: 180,
      protein: 13,
      carbs: 1,
      fat: 14,
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
const aiRequests = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).includes("analyzeFoodText")
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.profile = {};
  api.createMealEntry.mockResolvedValue({ id: "m1" });
  api.saveLog.mockResolvedValue(undefined);
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes("analyzeFoodText")
      ? ({ ok: true, json: async () => AI_MEAL } as Response)
      : ({ ok: true, json: async () => ({ products: [] }) } as Response)
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function typeAndLog(text = "2 eggs") {
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

describe("a typed meal and the AI question", () => {
  it("asks before anything is sent; Allow stores the yes and sends the meal to Gemini", async () => {
    typeAndLog();
    expect(await screen.findByText(QUESTION)).toBeTruthy();
    expect(aiRequests()).toHaveLength(0);
    expect(api.createMealEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(aiRequests()).toHaveLength(1);
    expect(auth.updateProfile).toHaveBeenCalledWith({
      aiAnalysisEnabled: true,
    });
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ confidence: "ai-parse" })
    );
  });

  it("Not now stores the no, sends nothing, and logs the meal read on the phone", async () => {
    typeAndLog();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(aiRequests()).toHaveLength(0);
    expect(auth.updateProfile).toHaveBeenCalledWith({
      aiAnalysisEnabled: false,
    });
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        confidence: "nl-parse",
        items: [
          expect.objectContaining({ name: expect.stringMatching(/egg/i) }),
        ],
      })
    );
  });

  it("closing the question logs nothing, sends nothing, and keeps the draft", async () => {
    const input = typeAndLog();
    await screen.findByText(QUESTION);
    fireEvent.keyDown(document, { key: "Escape" });
    // Anchor: Log is usable again, so the attempt has ended.
    await waitFor(() =>
      expect(screen.getByLabelText("Log meal")).toBeEnabled()
    );
    expect(aiRequests()).toHaveLength(0);
    expect(api.createMealEntry).not.toHaveBeenCalled();
    expect(auth.updateProfile).not.toHaveBeenCalled();
    expect(input).toHaveValue("2 eggs");
  });

  it("an account that has said no is never asked or sent, and its meal is logged", async () => {
    auth.profile = { aiAnalysisEnabled: false };
    typeAndLog();
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(aiRequests()).toHaveLength(0);
    expect(api.createMealEntry).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ confidence: "nl-parse" })
    );
  });

  it("an account that has said yes is not asked again", async () => {
    auth.profile = { aiAnalysisEnabled: true };
    typeAndLog();
    await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledOnce());
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(aiRequests()).toHaveLength(1);
  });
});

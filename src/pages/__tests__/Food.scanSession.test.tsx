/**
 * Food — every tap on the camera button opens a fresh scanner.
 *
 * The analyzer stays mounted after its camera is closed with the X. When
 * the button toggled the analyzer, the next tap unmounted it and a second
 * tap was needed to open the scanner again. Each tap now starts a new
 * session: the analyzer remounts and its camera opens.
 *
 * The analyzer is a stub that counts its mounts and can close "its
 * camera" the way the real one does, by staying mounted.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const analyzer = vi.hoisted(() => ({ mounts: 0 }));

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

vi.mock("@/components/FoodAnalyzer", () => ({
  default: function StubAnalyzer() {
    const [cameraOpen, setCameraOpen] = useState(true);
    useEffect(() => {
      analyzer.mounts += 1;
    }, []);
    return (
      <div data-testid="stub-analyzer" data-camera={String(cameraOpen)}>
        <button type="button" onClick={() => setCameraOpen(false)}>
          stub-close-camera
        </button>
      </div>
    );
  },
}));

import Food from "../Food";

afterEach(() => {
  cleanup();
  analyzer.mounts = 0;
});

describe("Food — the camera button", () => {
  it("opens a fresh scanner on every tap, including after the camera was closed", async () => {
    render(
      <MemoryRouter>
        <Food />
      </MemoryRouter>
    );
    const scan = await screen.findByRole("button", { name: "Scan a meal" });
    fireEvent.click(scan);
    const first = await screen.findByTestId("stub-analyzer");
    expect(first.dataset.camera).toBe("true");
    expect(analyzer.mounts).toBe(1);

    // Close the camera with the X: the analyzer stays mounted.
    fireEvent.click(screen.getByText("stub-close-camera"));
    expect(screen.getByTestId("stub-analyzer").dataset.camera).toBe("false");

    // One tap opens the scanner again.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scan a meal" }));
    });
    await waitFor(() => expect(analyzer.mounts).toBe(2));
    expect(screen.getByTestId("stub-analyzer").dataset.camera).toBe("true");
  });
});

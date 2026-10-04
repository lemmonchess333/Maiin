/**
 * Food — the Pro line waits for the guide's food-box hint (FV2).
 *
 * A free account's first visit to Food after the walk had two things
 * under the food box at once: the guide's hint pointing at the box, and
 * the "Photo logging is part of Pro" line beside it. The line now waits
 * until the hint has been closed, so the visit shows one thing at a time.
 *
 * The hint itself is stubbed: its own showing and closing are
 * GuideHint.test.tsx's business. What is pinned here is Food's side of
 * it, which is the order.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hint = vi.hoisted(() => ({ owed: false }));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1", getIdToken: async () => "test-token" } },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
  // The Pro line's link label reads the profile's trial history.
  useAuth: () => ({ profile: null }),
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: false }),
  hasLapsedOnboardingTrial: () => false,
}));
vi.mock("@/hooks/useGuideHint", () => ({
  useGuideHint: () => ({
    allowed: true,
    owed: hint.owed,
    markSeen: vi.fn(),
  }),
}));
vi.mock("@/components/guide/GuideHint", () => ({
  default: ({
    requested,
    onClose,
  }: {
    requested?: boolean;
    onClose?: () => void;
  }) =>
    requested || hint.owed ? (
      <button type="button" onClick={() => onClose?.()}>
        Got it
      </button>
    ) : null,
}));
vi.mock("@/lib/mealEntry", () => ({
  createMealEntry: vi.fn(),
  notifyMealsLogged: vi.fn(),
  undoMealEntries: vi.fn(),
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
// A free account whose tier has no photo scans: the Pro line's case.
vi.mock("@/hooks/useScanUsage", () => ({
  useScanUsage: () => ({
    remaining: 0,
    isUnlimited: false,
    loading: false,
    limit: 0,
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

const PRO_LINE = "Photo logging is part of Pro";

function renderFood(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/food", state }]}>
      <Food />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  hint.owed = false;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Food — the Pro line and the guide's food-box hint", () => {
  it("shows the Pro line at once when no hint is due", async () => {
    renderFood();
    expect(await screen.findByText(PRO_LINE)).toBeInTheDocument();
  });

  it("holds the Pro line while the hint is up, and shows it once the hint is closed", async () => {
    hint.owed = true;
    renderFood();
    // Anchor: the hint is drawn in the same pass as the line would be.
    const gotIt = await screen.findByRole("button", { name: "Got it" });
    expect(screen.queryByText(PRO_LINE)).toBeNull();

    fireEvent.click(gotIt);
    expect(await screen.findByText(PRO_LINE)).toBeInTheDocument();
  });

  it("holds it too when the first-week card's row asked for the hint", async () => {
    renderFood({ guide: "food-composer" });
    const gotIt = await screen.findByRole("button", { name: "Got it" });
    expect(screen.queryByText(PRO_LINE)).toBeNull();

    fireEvent.click(gotIt);
    expect(await screen.findByText(PRO_LINE)).toBeInTheDocument();
  });
});

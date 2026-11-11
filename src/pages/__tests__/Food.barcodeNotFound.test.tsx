/**
 * Food — a scanned barcode with no match (F2d).
 *
 * The scanner offers Describe it or Type details. Describe it opens the
 * composer asking what the product is, with nothing typed for the
 * person. Type details opens the product form with the code, and
 * leaving the form without saving goes back to the choice rather than
 * to a live scanner.
 *
 * The analyzer and the manual form are stubs that expose what Food hands
 * them.
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
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createMealEntry: vi.fn(),
  notifyMealsLogged: vi.fn(),
  addFavourite: vi.fn(),
  saveLog: vi.fn(),
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
  ManualFoodLogger: (props: {
    open: boolean;
    barcode?: string | null;
    onClose: () => void;
    onSaved?: () => void;
  }) =>
    props.open ? (
      <div data-testid="stub-manual" data-barcode={props.barcode ?? ""}>
        <button onClick={() => props.onClose()}>stub-manual-back</button>
        <button
          onClick={() => {
            props.onSaved?.();
            props.onClose();
          }}
        >
          stub-manual-save
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/FoodAnalyzer", () => ({
  default: (props: {
    notFoundBarcode?: string | null;
    onDescribeProduct?: () => void;
    onTypeProductDetails?: (code: string) => void;
  }) => (
    <div
      data-testid="stub-analyzer"
      data-not-found={props.notFoundBarcode ?? ""}
    >
      <button onClick={() => props.onDescribeProduct?.()}>stub-describe</button>
      <button onClick={() => props.onTypeProductDetails?.("5012345678900")}>
        stub-details
      </button>
    </div>
  ),
}));

import Food from "../Food";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openScanner() {
  render(
    <MemoryRouter>
      <Food />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole("button", { name: "Scan a meal" }));
  return screen.findByTestId("stub-analyzer");
}

describe("Food — a barcode with no match", () => {
  it("Describe it opens the composer asking what the product is, with nothing typed", async () => {
    await openScanner();
    fireEvent.click(screen.getByText("stub-describe"));
    await waitFor(() =>
      expect(screen.queryByTestId("stub-analyzer")).toBeNull()
    );
    const composer = screen.getByRole("textbox", { name: "What did you eat" });
    expect(composer).toHaveAttribute("placeholder", "What is this product?");
    expect(composer).toHaveValue("");
  });

  it("Type details opens the product form with the code", async () => {
    await openScanner();
    fireEvent.click(screen.getByText("stub-details"));
    const form = await screen.findByTestId("stub-manual");
    expect(form.dataset.barcode).toBe("5012345678900");
    expect(screen.queryByTestId("stub-analyzer")).toBeNull();
  });

  it("goes back to the choice, not the camera, when the form is left unsaved", async () => {
    await openScanner();
    fireEvent.click(screen.getByText("stub-details"));
    await screen.findByTestId("stub-manual");
    await act(async () => {
      fireEvent.click(screen.getByText("stub-manual-back"));
    });
    const analyzer = await screen.findByTestId("stub-analyzer");
    expect(analyzer.dataset.notFound).toBe("5012345678900");
  });

  it("stays closed once the product is saved", async () => {
    await openScanner();
    fireEvent.click(screen.getByText("stub-details"));
    await screen.findByTestId("stub-manual");
    await act(async () => {
      fireEvent.click(screen.getByText("stub-manual-save"));
    });
    expect(screen.queryByTestId("stub-manual")).toBeNull();
    expect(screen.queryByTestId("stub-analyzer")).toBeNull();
  });
});

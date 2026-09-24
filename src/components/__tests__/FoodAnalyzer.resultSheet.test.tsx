/**
 * FoodAnalyzer — the scan result as a sheet.
 *
 * A result used to land as a card below the composer that nothing
 * scrolled to: when the scanner closed, it sat behind the tab bar with
 * its Log button a screen and a half down. It now opens as a sheet over
 * the page whose foot always shows the Log button, named for the meal it
 * logs to, in food orange (owner call, CLAUDE.md Button mapping).
 *
 * The camera modal is stubbed to a prop probe, as in the outcome-routing
 * suite; the hook's result is a mutable fixture the capture sets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";

const h = vi.hoisted(() => ({
  analyzeFood: vi.fn(),
  reset: vi.fn(),
  state: { result: null as unknown },
}));

vi.mock("@/hooks/useFoodAnalysis", () => ({
  useFoodAnalysis: () => ({
    analyzeFood: h.analyzeFood,
    analyzeFoodText: vi.fn(),
    loading: false,
    error: null,
    result: h.state.result,
    reset: () => {
      h.reset();
      h.state.result = null;
    },
  }),
}));

vi.mock("@/components/FoodCameraModal", () => ({
  default: (props: {
    open: boolean;
    initialTab?: string;
    onCaptureBase64: (b64: string, mode: string) => Promise<void>;
    onBarcodeDetected: (raw: string) => Promise<void>;
    onClose: () => void;
  }) => (
    <div
      data-testid="stub-modal"
      data-open={String(props.open)}
      data-tab={props.initialTab ?? ""}
    >
      <button onClick={() => void props.onCaptureBase64("QUJD", "food")}>
        stub-capture
      </button>
      <button onClick={() => void props.onCaptureBase64("QUJD", "label")}>
        stub-capture-label
      </button>
      <button onClick={() => void props.onBarcodeDetected("5000112637922")}>
        stub-barcode
      </button>
      <button onClick={() => props.onClose()}>stub-close</button>
    </div>
  ),
}));

/* Reduced motion: the 420ms completion beat is skipped. */
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestoreWrite", () => ({ setDocGuarded: vi.fn() }));
vi.mock("@/lib/mealEntry", () => ({
  createMealEntry: vi.fn(async () => ({ id: "meal-1" })),
  notifyMealsLogged: vi.fn(),
}));
vi.mock("@/lib/foodPhotoStore", () => ({
  saveFoodPhoto: vi.fn(async () => true),
}));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({
  invalidateFoodPhotoCache: vi.fn(),
  useFoodPhotoUrls: () => ({}),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u-sheet" }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/sharePhoto", () => ({
  isPhotoShareSupported: () => false,
  sharePhotoToLibrary: vi.fn(),
}));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({ addFavourite: vi.fn() }),
}));

import FoodAnalyzer from "../FoodAnalyzer";
import { mealSlotFor } from "@/lib/mealSlots";
import { MEAL_LABELS } from "../food/mealConstants";

const MEAL = {
  foodName: "Lunch Plate",
  items: [
    {
      name: "Grilled chicken breast",
      portionSize: "150 g",
      calories: 248,
      protein: 46,
      carbs: 0,
      fat: 5,
    },
    {
      name: "Avocado",
      portionSize: "70 g",
      calories: 112,
      protein: 1,
      carbs: 6,
      fat: 10,
    },
    {
      name: "Cherry tomatoes",
      portionSize: "80 g",
      calories: 14,
      protein: 1,
      carbs: 3,
      fat: 0,
    },
    {
      name: "Mixed leaves",
      portionSize: "40 g",
      calories: 8,
      protein: 1,
      carbs: 1,
      fat: 0,
    },
    {
      name: "Creamy dressing",
      portionSize: "2 tbsp",
      calories: 130,
      protein: 0,
      carbs: 2,
      fat: 14,
    },
  ],
  totalCalories: 512,
  totalProtein: 49,
  totalCarbs: 12,
  totalFat: 29,
  confidence: "high",
};

const modal = () => screen.getByTestId("stub-modal");
const sheet = () => screen.getByTestId("scan-result-sheet");

async function scan(
  meal: string | null = "breakfast",
  button = "stub-capture"
) {
  h.analyzeFood.mockImplementation(async () => {
    h.state.result = MEAL;
    return { data: MEAL, errorMessage: null };
  });
  render(<FoodAnalyzer date="2026-09-23" meal={meal} />);
  await waitFor(() => expect(modal().dataset.open).toBe("true"));
  fireEvent.click(screen.getByText(button));
  await waitFor(() => expect(modal().dataset.open).toBe("false"));
  await screen.findByTestId("scan-result-sheet");
}

beforeEach(() => {
  h.state.result = null;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("FoodAnalyzer — the result sheet", () => {
  it("opens over the page once the scanner closes, titled with the name the diary will carry", async () => {
    await scan();
    // The name built from the items, which performSave persists — not
    // the AI's category title ("Lunch Plate").
    expect(
      screen.getByRole("heading", {
        name: "Grilled chicken breast, Avocado +3",
      })
    ).toBeTruthy();
    expect(screen.queryByText("Lunch Plate")).toBeNull();
    expect(
      within(sheet()).getByText("AI estimate · check the portions")
    ).toBeTruthy();
  });

  it("names the meal on its Log button, in food orange", async () => {
    await scan("breakfast");
    const log = screen.getByRole("button", { name: "Log to Breakfast" });
    expect(log).toHaveClass("bg-nutrition-fill");
  });

  it("with no meal targeted, names the slot the diary files it under", async () => {
    await scan(null);
    const slot = mealSlotFor({ createdAt: { toDate: () => new Date() } });
    expect(
      screen.getByRole("button", { name: `Log to ${MEAL_LABELS[slot]}` })
    ).toBeTruthy();
  });

  it("gives each item's name the row: portion and calories sit under it", async () => {
    await scan();
    const rows = screen.getAllByTestId("scan-result-item");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("Grilled chicken breast");
    expect(rows[0]).toHaveTextContent("150 g · 248 kcal");
  });

  it("follows the edits: removing an item renames the log", async () => {
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Remove Avocado" }));
    expect(
      screen.getByRole("heading", {
        name: "Grilled chicken breast, Cherry tomatoes +2",
      })
    ).toBeTruthy();
  });

  it("Retake drops the result and reopens the scanner on the tab the photo came from", async () => {
    await scan("breakfast", "stub-capture-label");
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    expect(h.reset).toHaveBeenCalled();
    await waitFor(() => expect(modal().dataset.open).toBe("true"));
    expect(modal().dataset.tab).toBe("label");
    await waitFor(() =>
      expect(screen.queryByTestId("scan-result-sheet")).toBeNull()
    );
  });

  it("dismissing the sheet drops the result", async () => {
    await scan();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(h.reset).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId("scan-result-sheet")).toBeNull()
    );
  });

  it('confirms a log with "Saved", no exclamation mark', async () => {
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Log to Breakfast" }));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy();
    expect(screen.queryByText(/Saved!/)).toBeNull();
  });

  it("a barcode result: the product is the title, the brand the caption, and Scan again goes back to Barcode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: "Oat drink",
            brands: "Oatly",
            serving_size: "250 ml",
            nutriments: {
              "energy-kcal_100g": 46,
              proteins_100g: 1,
              carbohydrates_100g: 6.6,
              fat_100g: 1.5,
            },
          },
        }),
      }))
    );
    render(<FoodAnalyzer date="2026-09-23" meal="breakfast" />);
    await waitFor(() => expect(modal().dataset.open).toBe("true"));
    fireEvent.click(screen.getByText("stub-barcode"));
    await screen.findByTestId("scan-result-sheet");
    expect(screen.getByRole("heading", { name: "Oat drink" })).toBeTruthy();
    expect(within(sheet()).getByText("Oatly")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scan again" }));
    await waitFor(() => expect(modal().dataset.open).toBe("true"));
    expect(modal().dataset.tab).toBe("barcode");
  });
});

/**
 * FoodAnalyzer — a scanned barcode's amount.
 *
 * The result took its amount from a stepper that moved half a serving at
 * a time with no way to type, so on a per-100g product 30 g could not be
 * logged. It now takes a typed amount, in grams when the numbers are per
 * 100 g, as the search result's sheet does.
 *
 * The camera modal is a prop probe that "reads" one barcode; Open Food
 * Facts is a stubbed fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

vi.mock("@/hooks/useFoodAnalysis", () => ({
  useFoodAnalysis: () => ({
    analyzeFood: vi.fn(),
    analyzeFoodText: vi.fn(),
    loading: false,
    error: null,
    result: null,
    reset: vi.fn(),
  }),
}));

vi.mock("@/components/FoodCameraModal", () => ({
  default: (props: {
    open: boolean;
    failure?: string | null;
    initialTab?: string;
    onBarcodeDetected: (raw: string) => Promise<unknown>;
    onDescribeProduct?: () => void;
    onTypeProductDetails?: () => void;
  }) => (
    <div
      data-testid="stub-modal"
      data-open={String(props.open)}
      data-failure={props.failure ?? ""}
      data-tab={props.initialTab ?? ""}
    >
      <button onClick={() => void props.onBarcodeDetected("5000112637922")}>
        stub-barcode
      </button>
      {props.onDescribeProduct && (
        <button onClick={props.onDescribeProduct}>stub-describe</button>
      )}
      {props.onTypeProductDetails && (
        <button onClick={props.onTypeProductDetails}>stub-details</button>
      )}
    </div>
  ),
}));

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
vi.mock("@/lib/auth", () => ({ useUid: () => "u-barcode" }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/sharePhoto", () => ({
  isPhotoShareSupported: () => false,
  sharePhotoToLibrary: vi.fn(),
}));
const pantry = vi.hoisted(() => ({ favourites: [] as unknown[] }));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({
    addFavourite: vi.fn(),
    favourites: pantry.favourites,
  }),
}));

import FoodAnalyzer from "../FoodAnalyzer";
import { createMealEntry } from "@/lib/mealEntry";
import { toast } from "@/lib/toast";
import { AI_ALLOWED } from "@/test/aiConsentFixtures";

const modal = () => screen.getByTestId("stub-modal");

function product(extra: Record<string, unknown> = {}) {
  return {
    product_name: "Cornflakes",
    brands: "Acme",
    nutriments: {
      "energy-kcal_100g": 372,
      proteins_100g: 8,
      carbohydrates_100g: 82,
      fat_100g: 1,
    },
    ...extra,
  };
}

async function scanProduct(p: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, product: p }),
    }))
  );
  render(
    <FoodAnalyzer date="2026-09-23" meal="breakfast" aiConsent={AI_ALLOWED} />
  );
  await waitFor(() => expect(modal().dataset.open).toBe("true"));
  fireEvent.click(screen.getByText("stub-barcode"));
  await screen.findByTestId("scan-result-sheet");
}

const logButton = () => screen.getByRole("button", { name: /^Log to / });
const savedEntry = () =>
  vi.mocked(createMealEntry).mock.calls[0][1] as {
    items: { portionSize: string; calories: number }[];
    totalCalories: number;
  };

beforeEach(() => {
  pantry.favourites = [];
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

describe("FoodAnalyzer — a barcode result's amount is typed", () => {
  it("takes grams on a per-100g product, and logs what was typed", async () => {
    // No serving size, so the numbers are per 100 g: 30 g is 0.3 of them.
    await scanProduct(product());
    expect(screen.getByLabelText("Grams")).toHaveValue("100");
    fireEvent.change(screen.getByLabelText("Grams"), {
      target: { value: "30" },
    });
    fireEvent.click(logButton());
    await waitFor(() => expect(createMealEntry).toHaveBeenCalledTimes(1));
    expect(savedEntry().items[0].portionSize).toBe("0.3x 100g");
    expect(savedEntry().totalCalories).toBe(112);
  });

  it("takes servings on a product that states one", async () => {
    await scanProduct(product({ serving_size: "30 g" }));
    expect(screen.getByLabelText("Servings")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "1.25" },
    });
    fireEvent.click(logButton());
    await waitFor(() => expect(createMealEntry).toHaveBeenCalledTimes(1));
    expect(savedEntry().items[0].portionSize).toBe("1.25x 30 g");
  });

  it("steps grams by 10", async () => {
    await scanProduct(product());
    fireEvent.click(screen.getByRole("button", { name: "Increase grams" }));
    expect(screen.getByLabelText("Grams")).toHaveValue("110");
  });

  it("refuses to log a blank amount", async () => {
    await scanProduct(product());
    fireEvent.change(screen.getByLabelText("Grams"), { target: { value: "" } });
    expect(logButton()).toBeDisabled();
    fireEvent.click(logButton());
    expect(createMealEntry).not.toHaveBeenCalled();
  });
});

describe("FoodAnalyzer — a barcode with no match (F2d)", () => {
  function stubNotFound() {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 0 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function scanUnknown(props: Record<string, unknown> = {}) {
    stubNotFound();
    render(
      <FoodAnalyzer
        date="2026-09-23"
        meal="breakfast"
        aiConsent={AI_ALLOWED}
        {...props}
      />
    );
    await waitFor(() => expect(modal().dataset.open).toBe("true"));
    fireEvent.click(screen.getByText("stub-barcode"));
    await waitFor(() =>
      expect(modal().dataset.failure).toBe("barcode-not-found")
    );
  }

  it("keeps the scanner open on the choice, not a toast", async () => {
    await scanUnknown();
    expect(modal().dataset.open).toBe("true");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("hands Type details the code, and closes the scanner", async () => {
    const onTypeProductDetails = vi.fn();
    await scanUnknown({ onTypeProductDetails });
    fireEvent.click(screen.getByText("stub-details"));
    expect(onTypeProductDetails).toHaveBeenCalledWith("5000112637922");
    expect(modal().dataset.open).toBe("false");
  });

  it("hands Describe it to the composer, and closes the scanner", async () => {
    const onDescribeProduct = vi.fn();
    await scanUnknown({ onDescribeProduct });
    fireEvent.click(screen.getByText("stub-describe"));
    expect(onDescribeProduct).toHaveBeenCalledTimes(1);
    expect(modal().dataset.open).toBe("false");
  });

  it("opens back on the choice for the code it was about", async () => {
    // The way back from the product form: no second scan needed.
    const onTypeProductDetails = vi.fn();
    render(
      <FoodAnalyzer
        date="2026-09-23"
        aiConsent={AI_ALLOWED}
        notFoundBarcode="5012345678900"
        onTypeProductDetails={onTypeProductDetails}
      />
    );
    await waitFor(() => expect(modal().dataset.open).toBe("true"));
    expect(modal().dataset.failure).toBe("barcode-not-found");
    expect(modal().dataset.tab).toBe("barcode");
    fireEvent.click(screen.getByText("stub-details"));
    expect(onTypeProductDetails).toHaveBeenCalledWith("5012345678900");
  });

  it("finds a product typed in before in the pantry, without asking the database", async () => {
    pantry.favourites = [
      {
        id: "flapjack",
        name: "Corner shop flapjack",
        calories: 320,
        protein: 5,
        carbs: 40,
        fat: 15,
        servingSize: "1 serving",
        useCount: 1,
        timeOfDay: "any",
        source: "barcode",
        barcode: "5000112637922",
      },
    ];
    const fetchMock = stubNotFound();
    render(
      <FoodAnalyzer date="2026-09-23" meal="breakfast" aiConsent={AI_ALLOWED} />
    );
    await waitFor(() => expect(modal().dataset.open).toBe("true"));
    fireEvent.click(screen.getByText("stub-barcode"));
    await screen.findByTestId("scan-result-sheet");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Corner shop flapjack" })
    ).toBeTruthy();
    // Its own figures, not the database's, so no credit to it.
    expect(screen.queryByText("Food data from Open Food Facts")).toBeNull();
    fireEvent.click(logButton());
    await waitFor(() => expect(createMealEntry).toHaveBeenCalledTimes(1));
    expect(savedEntry().totalCalories).toBe(320);
  });
});

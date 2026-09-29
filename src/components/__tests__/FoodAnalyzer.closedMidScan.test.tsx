/**
 * FoodAnalyzer — closing the scanner mid-scan abandons the scan.
 *
 * The X is there for slow scans. A scan still running when the scanner
 * closed carried on, and its result opened the sheet seconds later over
 * whatever the page was doing: with no photo (closing drops the capture),
 * and logging to whatever day the diary showed by then. The outcome of an
 * abandoned scan is dropped: no sheet, no error card, and no spinner
 * saying the page is still analysing.
 *
 * The analysis hook is the real one, so its own state update is what
 * would open the sheet; fetch is stubbed and answers when the test says.
 * The camera modal is stubbed to a prop probe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";

vi.mock("@/components/FoodCameraModal", () => ({
  default: (props: {
    open: boolean;
    loading: boolean;
    onCaptureBase64: (b64: string, mode: string) => Promise<void>;
    onBarcodeDetected: (raw: string) => Promise<unknown>;
    onClose: () => void;
  }) => (
    <div
      data-testid="stub-modal"
      data-open={String(props.open)}
      data-loading={String(props.loading)}
    >
      <button onClick={() => void props.onCaptureBase64("QUJD", "food")}>
        stub-capture
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
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u-late", getIdToken: async () => "token" } },
}));
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
vi.mock("@/lib/auth", () => ({ useUid: () => "u-late" }));
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
import { toast } from "@/lib/toast";

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
  ],
  totalCalories: 360,
  totalProtein: 47,
  totalCarbs: 6,
  totalFat: 15,
  confidence: "high",
};

const PRODUCT = {
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
};

const modal = () => screen.getByTestId("stub-modal");

/** Starts a scan whose request hangs, then closes the scanner over it.
 *  Returns the function that answers the request. */
async function startThenClose(button: "stub-capture" | "stub-barcode") {
  let answer!: (response: unknown) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<FoodAnalyzer date="2026-09-23" meal="lunch" />);
  await waitFor(() => expect(modal().dataset.open).toBe("true"));
  fireEvent.click(screen.getByText(button));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(modal().dataset.loading).toBe("true");
  fireEvent.click(screen.getByText("stub-close"));
  await waitFor(() => expect(modal().dataset.open).toBe("false"));
  return async (response: unknown) => {
    await act(async () => answer(response));
    // Anchor: the request has settled, so its outcome has landed.
    await waitFor(() => expect(modal().dataset.loading).toBe("false"));
  };
}

beforeEach(() => {
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

describe("FoodAnalyzer — closing the scanner mid-scan", () => {
  it("drops a photo result that lands after the scanner closed", async () => {
    const answer = await startThenClose("stub-capture");
    // Nothing on the page says a result is still coming.
    expect(screen.queryByText(/Analyzing/)).toBeNull();
    await answer({ ok: true, json: async () => MEAL });
    expect(screen.queryByTestId("scan-result-sheet")).toBeNull();
  });

  it("drops a failure too, so the page shows no error card for it", async () => {
    const answer = await startThenClose("stub-capture");
    await answer({ ok: false, status: 500, json: async () => ({}) });
    expect(screen.queryByText("Couldn't identify food.")).toBeNull();
  });

  it("drops a barcode product that lands after the scanner closed", async () => {
    const answer = await startThenClose("stub-barcode");
    expect(screen.queryByText(/Fetching nutrition/)).toBeNull();
    await answer({ ok: true, status: 200, json: async () => PRODUCT });
    expect(screen.queryByTestId("scan-result-sheet")).toBeNull();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it("says nothing about a barcode lookup that fails after the scanner closed", async () => {
    const answer = await startThenClose("stub-barcode");
    await answer({ ok: true, status: 200, json: async () => ({ status: 0 }) });
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't identify food.")).toBeNull();
  });
});

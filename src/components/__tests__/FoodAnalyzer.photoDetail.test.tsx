/**
 * FoodAnalyzer — Add a detail (Mob2, call 3). A photo's result offers a
 * line for what the photo cannot show, sent with the same photo for a
 * second read. The consent gate is the one every photo passes, a failed
 * second read leaves the first answer on screen, and a barcode result has
 * no photo to send.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const h = vi.hoisted(() => ({
  analyzeFood: vi.fn(),
  state: { result: null as unknown },
}));

vi.mock("@/hooks/useFoodAnalysis", async () => {
  const { useState } = await import("react");
  return {
    useFoodAnalysis: () => {
      /* An adopted answer re-renders the scanner, as the hook's own
         state does. */
      const [, rerender] = useState(0);
      return {
        analyzeFood: h.analyzeFood,
        analyzeFoodText: vi.fn(),
        loading: false,
        error: null,
        result: h.state.result,
        reset: () => {
          h.state.result = null;
        },
        /* The hook's second read, as useFoodAnalysis.test pins it: an
           answer with items replaces the result, anything else leaves it. */
        refine: async (photo: string, detail: string) => {
          const outcome = await h.analyzeFood(photo, {
            detail,
            keepResult: true,
          });
          const adopted = !!outcome.data?.items?.length;
          if (adopted) {
            h.state.result = outcome.data;
            rerender((n) => n + 1);
          }
          return { ...outcome, adopted };
        },
      };
    },
  };
});

vi.mock("@/components/FoodCameraModal", () => ({
  default: (props: {
    open: boolean;
    onCaptureBase64: (b64: string, mode: string) => Promise<void>;
    onBarcodeDetected: (raw: string) => Promise<void>;
  }) => (
    <div data-testid="stub-modal" data-open={String(props.open)}>
      <button onClick={() => void props.onCaptureBase64("QUJD", "food")}>
        stub-capture
      </button>
      <button onClick={() => void props.onBarcodeDetected("5000112637922")}>
        stub-barcode
      </button>
    </div>
  ),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
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
vi.mock("@/lib/auth", () => ({ useUid: () => "u-detail" }));
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
import { AI_ALLOWED } from "@/test/aiConsentFixtures";
import type { AiConsentGate } from "@/hooks/useAiConsent";

const plate = (name: string, calories: number) => ({
  foodName: name,
  items: [
    { name, portionSize: "1 plate", calories, protein: 30, carbs: 40, fat: 20 },
  ],
  totalCalories: calories,
  totalProtein: 30,
  totalCarbs: 40,
  totalFat: 20,
  confidence: "medium",
});

const modal = () => screen.getByTestId("stub-modal");

async function scanPhoto(aiConsent: AiConsentGate = AI_ALLOWED) {
  h.analyzeFood.mockImplementationOnce(async () => {
    h.state.result = plate("Steak and chips", 700);
    return { data: h.state.result, errorMessage: null };
  });
  render(
    <FoodAnalyzer date="2026-09-23" meal="dinner" aiConsent={aiConsent} />
  );
  await waitFor(() => expect(modal().dataset.open).toBe("true"));
  fireEvent.click(screen.getByText("stub-capture"));
  await screen.findByTestId("scan-result-sheet");
}

async function addDetail(text: string) {
  // The line is loaded with the result.
  fireEvent.click(await screen.findByRole("button", { name: "Add a detail" }));
  fireEvent.change(screen.getByLabelText("Add a detail"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Try again with this" }));
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

describe("FoodAnalyzer — Add a detail", () => {
  it("reads the same photo again with the words, and shows the new answer", async () => {
    await scanPhoto();
    h.analyzeFood.mockImplementationOnce(async () => ({
      data: plate("Ribeye and chips, cooked in butter", 850),
      errorMessage: null,
    }));
    await addDetail("  ribeye,   cooked in butter ");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Ribeye and chips, cooked in butter",
        })
      ).toBeTruthy()
    );
    expect(h.analyzeFood).toHaveBeenLastCalledWith("QUJD", {
      detail: "ribeye, cooked in butter",
      keepResult: true,
    });
  });

  it("keeps the first answer when the second read fails", async () => {
    await scanPhoto();
    h.analyzeFood.mockImplementationOnce(async () => ({
      data: null,
      errorMessage: "Couldn't reach the server.",
    }));
    await addDetail("cooked in butter");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't reach the server. The first result is still here.",
        expect.anything()
      )
    );
    expect(
      screen.getByRole("heading", { name: "Steak and chips" })
    ).toBeTruthy();
  });

  it("sends nothing without the person's yes", async () => {
    let asked = 0;
    const gate: AiConsentGate = {
      status: "allowed",
      ensure: async () => (++asked === 1 ? "allowed" : "dismissed"),
      ask: async () => "allowed",
    };
    await scanPhoto(gate);
    await addDetail("cooked in butter");
    await waitFor(() => expect(asked).toBe(2));
    expect(h.analyzeFood).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: "Steak and chips" })
    ).toBeTruthy();
  });

  it("has no detail line on a barcode result", async () => {
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
    render(
      <FoodAnalyzer date="2026-09-23" meal="breakfast" aiConsent={AI_ALLOWED} />
    );
    await waitFor(() => expect(modal().dataset.open).toBe("true"));
    fireEvent.click(screen.getByText("stub-barcode"));
    await screen.findByTestId("scan-result-sheet");
    expect(screen.getByRole("heading", { name: "Oat drink" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a detail" })).toBeNull();
  });
});

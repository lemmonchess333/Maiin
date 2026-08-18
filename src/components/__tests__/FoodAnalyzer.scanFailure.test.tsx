/**
 * FoodAnalyzer — the scan outcome state machine.
 *
 * The routing under test exists because of a silent-failure bug:
 * `useFoodAnalysis.analyzeFood` NEVER throws — it catches internally
 * and returns null — so the old try/catch + toast around it was dead
 * code, and `setCameraOpen(false)` ran unconditionally. Every failure
 * (request error AND "photographed the dog") therefore closed the
 * modal silently mid-sweep. The machine now resolves every outcome
 * visibly:
 *
 *   usable result → close to the result card (locked beat when motion)
 *   request null  → failure "error", modal STAYS open
 *   nothing identifiable → failure "no-food", modal stays open
 *   offline       → failure "offline" BEFORE any request is made
 *
 * The camera modal is stubbed to a prop probe: this suite is about
 * what the parent decides, not what the modal draws (the modal has
 * its own suite).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const analyzeFoodMock = vi.fn();

vi.mock("@/hooks/useFoodAnalysis", () => ({
  useFoodAnalysis: () => ({
    analyzeFood: analyzeFoodMock,
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
    loading: boolean;
    failure?: string | null;
    onCaptureBase64: (b64: string, mode: string) => Promise<void>;
    onScanRetry?: () => void;
    onClose: () => void;
  }) => (
    <div
      data-testid="stub-modal"
      data-open={String(props.open)}
      data-failure={props.failure ?? ""}
    >
      <button onClick={() => void props.onCaptureBase64("QUJD", "food")}>
        stub-capture
      </button>
      <button onClick={() => props.onScanRetry?.()}>stub-retry</button>
      <button onClick={() => props.onClose()}>stub-close</button>
    </div>
  ),
}));

/* Reduced motion TRUE: the success path's 420ms locked beat is
   skipped, so "usable → camera closes" needs no timer choreography.
   The beat itself is pinned in the modal's own suite. */
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestoreWrite", () => ({ setDocGuarded: vi.fn() }));
vi.mock("@/lib/foodPhotoUpload", () => ({ uploadFoodPhoto: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useUid: () => "u-scan" }));
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

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

const modal = () => screen.getByTestId("stub-modal");

async function openAndCapture() {
  render(<FoodAnalyzer date="2026-08-18" />);
  // The analyzer auto-opens the camera after a 150ms mount delay.
  await waitFor(() => expect(modal().dataset.open).toBe("true"));
  fireEvent.click(screen.getByText("stub-capture"));
}

beforeEach(() => setOnline(true));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setOnline(true);
});

describe("FoodAnalyzer — scan outcome routing", () => {
  it("request failure → failure beat 'error', modal stays open", async () => {
    analyzeFoodMock.mockResolvedValue(null);
    await openAndCapture();
    await waitFor(() => expect(modal().dataset.failure).toBe("error"));
    expect(modal().dataset.open).toBe("true");
  });

  it("nothing identifiable → failure beat 'no-food', modal stays open", async () => {
    // The "photographed my parents" case: the AI answers, but every
    // item is a generic fallback the name filter drops.
    analyzeFoodMock.mockResolvedValue({
      foodName: "No food detected",
      items: [
        {
          name: "Unidentifiable",
          portionSize: "",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
      ],
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      confidence: "high",
    });
    await openAndCapture();
    await waitFor(() => expect(modal().dataset.failure).toBe("no-food"));
    expect(modal().dataset.open).toBe("true");
  });

  it("usable result → modal closes, no failure", async () => {
    analyzeFoodMock.mockResolvedValue({
      foodName: "Chicken and rice",
      items: [
        {
          name: "Chicken breast",
          portionSize: "150g",
          calories: 240,
          protein: 45,
          carbs: 0,
          fat: 5,
        },
      ],
      totalCalories: 240,
      totalProtein: 45,
      totalCarbs: 0,
      totalFat: 5,
      confidence: "high",
    });
    await openAndCapture();
    await waitFor(() => expect(modal().dataset.open).toBe("false"));
    expect(modal().dataset.failure).toBe("");
  });

  it("offline → failure 'offline' and the request is never made", async () => {
    setOnline(false);
    analyzeFoodMock.mockResolvedValue(null);
    await openAndCapture();
    await waitFor(() => expect(modal().dataset.failure).toBe("offline"));
    expect(modal().dataset.open).toBe("true");
    // The pre-empt is the point: an instant honest answer instead of
    // burning the sweep on a fetch that must fail.
    expect(analyzeFoodMock).not.toHaveBeenCalled();
  });

  it("retake clears the failure and keeps the modal open for another go", async () => {
    analyzeFoodMock.mockResolvedValue(null);
    await openAndCapture();
    await waitFor(() => expect(modal().dataset.failure).toBe("error"));
    fireEvent.click(screen.getByText("stub-retry"));
    await waitFor(() => expect(modal().dataset.failure).toBe(""));
    expect(modal().dataset.open).toBe("true");
  });

  it("closing the modal clears the failure — a reopen never shows a stale verdict", async () => {
    analyzeFoodMock.mockResolvedValue(null);
    await openAndCapture();
    await waitFor(() => expect(modal().dataset.failure).toBe("error"));
    fireEvent.click(screen.getByText("stub-close"));
    await waitFor(() => expect(modal().dataset.open).toBe("false"));
    expect(modal().dataset.failure).toBe("");
  });
});

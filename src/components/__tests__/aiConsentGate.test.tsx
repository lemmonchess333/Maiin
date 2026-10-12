/**
 * Permission before a meal photo goes to Google (App Review 5.1.2(i)).
 *
 * Driven as Food wires it: the real `useAiConsent`, the real sheet, the
 * real FoodAnalyzer, with the profile answer in a mocked auth context.
 * The camera modal is a probe (its own AI-off row has its own suite,
 * FoodCameraModal.aiOff): it captures a photo, reports whether the photo
 * tabs are told AI analysis is off, and counts captures that have
 * finished, which is what anchors every "nothing was sent" below.
 *
 *   not asked → the first photo asks, before anything is sent
 *   Allow     → stored as true, and the held photo is analysed
 *   Not now   → stored as false, nothing sent, the photo tabs say off
 *   closed    → nothing stored, nothing sent; the next photo asks again
 *   off       → never asked, never sent; Turn on asks the same question
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
const probe = vi.hoisted(() => ({ settled: 0 }));
const auth = vi.hoisted(() => ({
  profile: {} as { aiAnalysisEnabled?: boolean },
  updateProfile: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/auth", () => ({
  useUid: () => "u-consent",
  useAuth: () => ({
    profile: auth.profile,
    updateProfile: auth.updateProfile,
  }),
}));
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
    aiOff?: { onTurnOn: () => void } | null;
    onCaptureBase64: (b64: string, mode: string) => Promise<void>;
  }) => (
    <div
      data-testid="stub-modal"
      data-open={String(props.open)}
      data-ai-off={String(Boolean(props.aiOff))}
    >
      <button
        onClick={() =>
          void props.onCaptureBase64("QUJD", "food").then(() => {
            probe.settled += 1;
          })
        }
      >
        stub-capture
      </button>
      <button onClick={() => props.aiOff?.onTurnOn()}>stub-turn-on</button>
    </div>
  ),
}));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/foodPhotoStore", () => ({
  saveFoodPhoto: vi.fn(async () => true),
}));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({
  invalidateFoodPhotoCache: vi.fn(),
  useFoodPhotoUrls: () => ({}),
}));
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
import AiConsentSheet from "../food/AiConsentSheet";
import { useAiConsent } from "@/hooks/useAiConsent";

const QUESTION = "Send food to Google for analysis?";

/** Food's wiring: one gate, handed to the scanner, and its sheet. */
function FoodScanner() {
  const consent = useAiConsent();
  return (
    <>
      <FoodAnalyzer date="2026-10-04" aiConsent={consent.gate} />
      <AiConsentSheet {...consent.sheet} />
    </>
  );
}

const modal = () => screen.getByTestId("stub-modal");

async function openScanner() {
  render(<FoodScanner />);
  // The analyzer opens the camera after a 150ms mount delay.
  await waitFor(() => expect(modal().dataset.open).toBe("true"));
}

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
  auth.profile = {};
  probe.settled = 0;
  analyzeFoodMock.mockResolvedValue({ data: null, errorMessage: "x" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a meal photo and the AI question", () => {
  it("asks before the first photo is sent; Allow stores the yes and sends the held photo", async () => {
    await openScanner();
    fireEvent.click(screen.getByText("stub-capture"));
    expect(await screen.findByText(QUESTION)).toBeTruthy();
    expect(
      screen.getByText(/sends the photo you take, or the meal you type/)
    ).toBeTruthy();
    // The question is up and nothing has gone anywhere.
    expect(analyzeFoodMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(analyzeFoodMock).toHaveBeenCalledWith("QUJD"));
    expect(auth.updateProfile).toHaveBeenCalledWith({
      aiAnalysisEnabled: true,
    });
    expect(modal().dataset.aiOff).toBe("false");
  });

  it("Not now stores the no, sends nothing, and the photo tabs say AI analysis is off", async () => {
    await openScanner();
    fireEvent.click(screen.getByText("stub-capture"));
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(probe.settled).toBe(1));
    expect(analyzeFoodMock).not.toHaveBeenCalled();
    expect(auth.updateProfile).toHaveBeenCalledWith({
      aiAnalysisEnabled: false,
    });
    // Without waiting for the profile to catch up.
    expect(modal().dataset.aiOff).toBe("true");
  });

  it("closing the question stores nothing and sends nothing, and the next photo asks again", async () => {
    await openScanner();
    fireEvent.click(screen.getByText("stub-capture"));
    await screen.findByText(QUESTION);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(probe.settled).toBe(1));
    expect(analyzeFoodMock).not.toHaveBeenCalled();
    expect(auth.updateProfile).not.toHaveBeenCalled();
    expect(modal().dataset.aiOff).toBe("false");

    fireEvent.click(screen.getByText("stub-capture"));
    expect(await screen.findByRole("button", { name: "Allow" })).toBeTruthy();
    expect(analyzeFoodMock).not.toHaveBeenCalled();
  });

  it("an account that has said no is never asked or sent; Turn on asks, and Allow sends again", async () => {
    auth.profile = { aiAnalysisEnabled: false };
    await openScanner();
    expect(modal().dataset.aiOff).toBe("true");
    fireEvent.click(screen.getByText("stub-capture"));
    await waitFor(() => expect(probe.settled).toBe(1));
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(analyzeFoodMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("stub-turn-on"));
    fireEvent.click(await screen.findByRole("button", { name: "Allow" }));
    await waitFor(() => expect(modal().dataset.aiOff).toBe("false"));
    expect(auth.updateProfile).toHaveBeenCalledWith({
      aiAnalysisEnabled: true,
    });
    fireEvent.click(screen.getByText("stub-capture"));
    await waitFor(() => expect(analyzeFoodMock).toHaveBeenCalledWith("QUJD"));
  });

  it("an account that has said yes is not asked again", async () => {
    auth.profile = { aiAnalysisEnabled: true };
    await openScanner();
    fireEvent.click(screen.getByText("stub-capture"));
    await waitFor(() => expect(analyzeFoodMock).toHaveBeenCalledWith("QUJD"));
    expect(screen.queryByText(QUESTION)).toBeNull();
  });
});

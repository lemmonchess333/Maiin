/**
 * FoodCameraModal — the analysis-in-flight scan treatment.
 *
 * History, because two real bugs live under this file:
 *
 * 1. The modal is `fixed inset-0` and opaque, and `FoodAnalyzer` only
 *    closes it AFTER `await analyzeFood(...)` — so the modal covers the
 *    screen for the whole Gemini round-trip. For as long as the scan
 *    feature existed, NOTHING rendered during that wait: the user
 *    watched a live camera feed with dead buttons, which reads as a
 *    freeze. (FoodAnalyzer's own spinner sat on the page underneath.)
 * 2. The camera-BLOCKED fallback surface still offers photo-library
 *    upload, and the first fix rendered the overlay only in the main
 *    return — re-creating the freeze for exactly the users most likely
 *    to hit it: anyone who denied camera permission and logs from the
 *    library every time. The overlay is now hoisted into both returns,
 *    and the blocked-branch test here is what keeps it that way.
 *
 * The treatment itself: captured photo as the hero, reticle corners,
 * one thin laser sweep (transform-only, the one ambient loop on the
 * surface — it REPLACED the spinner), and staged copy that advances
 * and HOLDS on the last line rather than wrapping.
 *
 * The camera is stubbed PENDING (never resolves) for main-branch tests
 * so the surface stays on the camera return; the blocked test rejects
 * it instead. Photos are armed through the real library input +
 * FileReader — no camera needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  renderHook,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import FoodCameraModal from "../FoodCameraModal";
import {
  useScanStages,
  SCAN_STAGES_FOOD,
  SCAN_STAGES_LABEL,
} from "@/hooks/useScanStages";
import { haptic } from "@/lib/haptic";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));

const realMatchMedia = window.matchMedia;

function stubCamera(behaviour: "pending" | "denied") {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia:
        behaviour === "pending"
          ? vi.fn().mockReturnValue(new Promise(() => {}))
          : vi.fn().mockRejectedValue(new Error("denied")),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
}

function stubReducedMotion(reduced: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduced && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => stubCamera("pending"));

afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
  vi.clearAllMocks();
});

const props = {
  open: true,
  onClose: vi.fn(),
  onCaptureBase64: vi.fn().mockResolvedValue(undefined),
  onBarcodeDetected: vi.fn().mockResolvedValue(undefined),
};

/** Arm a captured frame through the real library input + FileReader. */
async function armPhoto() {
  const file = new File(["not-really-a-jpeg"], "meal.jpg", {
    type: "image/jpeg",
  });
  const input = screen.getByLabelText("Upload food photo");
  fireEvent.change(input, { target: { files: [file] } });
  return await screen.findByTestId("scan-frame");
}

describe("FoodCameraModal — analysis in flight", () => {
  it("always says SOMETHING while loading, even with no captured frame", () => {
    // Barcode lookups reach this overlay with no photo — the fallback
    // is the plain labelled row, never a reticle over nothing.
    render(<FoodCameraModal {...props} loading />);
    expect(screen.getByLabelText(/analyzing food/i)).toBeTruthy();
    expect(screen.getByText(/fetching nutrition/i)).toBeTruthy();
    expect(screen.queryByTestId("scan-frame")).toBeNull();
  });

  it("is silent when idle — the overlay is not always-on", () => {
    render(<FoodCameraModal {...props} loading={false} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryAllByTestId("scan-corner").length).toBe(0);
  });

  it("scans the captured photo: frame, four corners, one laser, staged copy", async () => {
    render(<FoodCameraModal {...props} loading />);
    await armPhoto();
    expect(screen.getAllByTestId("scan-corner").length).toBe(4);
    expect(screen.getByTestId("scan-laser")).toBeTruthy();
    expect(screen.getByText(SCAN_STAGES_FOOD[0])).toBeTruthy();
    // The laser replaced the spinner — one motion on the surface.
    expect(screen.queryByText(/fetching nutrition/i)).toBeNull();
  });

  it("label mode gets label copy — a nutrition label is not a plate", async () => {
    render(<FoodCameraModal {...props} loading />);
    fireEvent.click(screen.getByText("Food label"));
    await armPhoto();
    expect(screen.getByText(SCAN_STAGES_LABEL[0])).toBeTruthy();
  });

  it("reduced motion keeps the frame and copy but drops the laser", async () => {
    stubReducedMotion(true);
    render(<FoodCameraModal {...props} loading />);
    await armPhoto();
    expect(screen.getAllByTestId("scan-corner").length).toBe(4);
    expect(screen.queryByTestId("scan-laser")).toBeNull();
    expect(screen.getByText(SCAN_STAGES_FOOD[0])).toBeTruthy();
  });

  it("camera-BLOCKED users get the same treatment from library upload", async () => {
    // The second freeze-bug: the blocked fallback offers library upload
    // but only the main return carried the overlay. This is the pin
    // that keeps the overlay in both.
    stubCamera("denied");
    render(<FoodCameraModal {...props} loading />);
    await screen.findByText(/camera access needed|camera unavailable/i);
    await armPhoto();
    expect(screen.getAllByTestId("scan-corner").length).toBe(4);
  });

  it("the photo floods the room — ambient backdrop behind the frame", async () => {
    // A blurred copy of the user's own photo sits behind the scan frame
    // so the wait is lit by the meal, not parked on flat black. STATIC
    // blur is the sanctioned recipe (BodyMapGlow: a blurred layer may
    // exist, a filter must never animate) — the pin asserts the filter
    // is present as an inline STYLE, i.e. set once, not driven.
    render(<FoodCameraModal {...props} loading />);
    await armPhoto();
    const backdrop = screen.getByTestId("scan-backdrop");
    const img = backdrop.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.style.filter).toContain("blur(");
  });

  it("no photo, no backdrop — nothing to flood the room with", () => {
    // The barcode/no-frame fallback keeps the plain dark surface. A
    // backdrop rendered unconditionally would flash a STALE previous
    // meal behind barcode lookups.
    render(<FoodCameraModal {...props} loading />);
    expect(screen.queryByTestId("scan-backdrop")).toBeNull();
  });

  it("the library button taps back like every other control here", () => {
    // It was the one silent button in the capture row — shutter, flip,
    // and tabs all haptic.
    render(<FoodCameraModal {...props} loading={false} />);
    fireEvent.click(screen.getByLabelText("Photo library"));
    expect(vi.mocked(haptic)).toHaveBeenCalledWith("light");
  });
});

describe("useScanStages", () => {
  it("advances through the stages and HOLDS on the last", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScanStages(true, SCAN_STAGES_FOOD));
    expect(result.current).toBe(SCAN_STAGES_FOOD[0]);
    act(() => vi.advanceTimersByTime(1300));
    expect(result.current).toBe(SCAN_STAGES_FOOD[1]);
    // Nine more intervals = 10 total. A wrap-around implementation
    // lands at 10 % 4 = index 2, NOT the last line — so this assertion
    // is what makes "holds, never wraps" a real claim.
    act(() => vi.advanceTimersByTime(1300 * 9));
    expect(result.current).toBe(SCAN_STAGES_FOOD[SCAN_STAGES_FOOD.length - 1]);
  });

  it("restarts from the first line when a new analysis begins", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ active }) => useScanStages(active, SCAN_STAGES_FOOD),
      { initialProps: { active: true } }
    );
    act(() => vi.advanceTimersByTime(1300 * 2));
    expect(result.current).toBe(SCAN_STAGES_FOOD[2]);
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current).toBe(SCAN_STAGES_FOOD[0]);
    // ...and the clock restarted too, not just the label.
    act(() => vi.advanceTimersByTime(1300));
    expect(result.current).toBe(SCAN_STAGES_FOOD[1]);
  });
});

describe("FoodCameraModal — the completion beat", () => {
  it("locked resolves the scan: overlay stays, laser stops, Done shows", async () => {
    // The parent holds `locked` for ~420ms after a usable result so the
    // scan visibly resolves instead of hard-cutting to the result card.
    // Loading is FALSE by then — the overlay must stay up on `locked`
    // alone, or the beat renders nothing at all.
    render(<FoodCameraModal {...props} loading={false} locked />);
    await armPhoto();
    expect(screen.getAllByTestId("scan-corner").length).toBe(4);
    expect(screen.queryByTestId("scan-laser")).toBeNull();
    expect(screen.getByText("Done")).toBeTruthy();
    // The check is DRAWN (motion.path), not a static glyph — the pin is
    // on the svg path so swapping back to the lucide icon fails here.
    expect(screen.getByTestId("scan-check")).toBeTruthy();
  });

  it("never claims Done while still analysing", async () => {
    render(<FoodCameraModal {...props} loading />);
    await armPhoto();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByTestId("scan-check")).toBeNull();
    expect(screen.getByTestId("scan-laser")).toBeTruthy();
  });

  it("the laser carries the reading-mesh window", async () => {
    render(<FoodCameraModal {...props} loading />);
    await armPhoto();
    expect(
      screen
        .getByTestId("scan-laser")
        .innerHTML.includes("repeating-linear-gradient")
    ).toBe(true);
  });
});

describe("FoodCameraModal — the failure beat", () => {
  /* Pre-beat, every failure closed the modal silently mid-sweep:
     the hook returns null instead of throwing, `usable` came back
     false, and the close ran unconditionally — so the scan
     evaporated and the user was dumped on a page-level card. These
     pins keep every failure resolving IN PLACE, where the user is
     already looking, with the next move one tap away. */

  it("no-food resolves the scan in place: honest copy, actions, no laser, neutral corners", async () => {
    render(
      <FoodCameraModal
        {...props}
        loading={false}
        failure="no-food"
        onScanRetry={vi.fn()}
        onRequestTypedInput={vi.fn()}
      />
    );
    await armPhoto();
    // `loading` is FALSE — the overlay must stand on `failure` alone.
    expect(screen.getByText("No food detected")).toBeTruthy();
    expect(screen.getByText("Retake photo")).toBeTruthy();
    expect(screen.getByText("Type it instead")).toBeTruthy();
    // The scan has ENDED: no sweep…
    expect(screen.queryByTestId("scan-laser")).toBeNull();
    // …and the corners settle to neutral — orange is the "reading"
    // register and must not hold over a failure verdict.
    const corners = screen.getAllByTestId("scan-corner");
    expect(corners.length).toBe(4);
    for (const c of corners) expect(c.style.borderColor).toBe("");
    // Announced as an alert, not a status feed.
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("error and offline get their own honest lines", async () => {
    const { unmount } = render(
      <FoodCameraModal {...props} loading={false} failure="error" />
    );
    expect(screen.getByText("Couldn't read this one")).toBeTruthy();
    unmount();
    render(<FoodCameraModal {...props} loading={false} failure="offline" />);
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.getByText(/scanning needs a connection/i)).toBeTruthy();
  });

  it("offline leads with Type it instead — retaking can't fix no connection", async () => {
    // The primary slot goes to the action that can actually succeed:
    // typing works fully offline (local NL parser + queue-routed
    // write); retaking lands on the same pre-empt again.
    render(
      <FoodCameraModal
        {...props}
        loading={false}
        failure="offline"
        onRequestTypedInput={vi.fn()}
      />
    );
    const buttons = screen
      .getByTestId("scan-failure")
      .querySelectorAll("button");
    expect(buttons[0].textContent).toContain("Type it instead");
    expect(buttons[1].textContent).toContain("Retake photo");
    // …while every other failure keeps Retake primary.
    cleanup();
    render(
      <FoodCameraModal
        {...props}
        loading={false}
        failure="no-food"
        onRequestTypedInput={vi.fn()}
      />
    );
    const noFoodButtons = screen
      .getByTestId("scan-failure")
      .querySelectorAll("button");
    expect(noFoodButtons[0].textContent).toContain("Retake photo");
  });

  it("label mode fails in label words — a nutrition panel is not a plate", async () => {
    render(<FoodCameraModal {...props} loading={false} failure="no-food" />);
    fireEvent.click(screen.getByText("Food label"));
    expect(screen.getByText("Couldn't read the label")).toBeTruthy();
    expect(screen.queryByText("No food detected")).toBeNull();
  });

  it("failure with no held frame still offers the full recovery, never the spinner row", () => {
    // Defensive branch: recovery must not depend on which branch the
    // user came in through.
    render(<FoodCameraModal {...props} loading={false} failure="error" />);
    expect(screen.getByText("Couldn't read this one")).toBeTruthy();
    expect(screen.getByText("Retake photo")).toBeTruthy();
    expect(screen.queryByText(/fetching nutrition/i)).toBeNull();
  });

  it("Retake drops the held frame and hands control back to the parent", async () => {
    const onScanRetry = vi.fn();
    render(
      <FoodCameraModal
        {...props}
        loading={false}
        failure="no-food"
        onScanRetry={onScanRetry}
      />
    );
    await armPhoto();
    fireEvent.click(screen.getByText("Retake photo"));
    expect(onScanRetry).toHaveBeenCalledTimes(1);
    // The frame is gone — the surface is ready for another go the
    // moment the parent clears `failure`.
    expect(screen.queryByTestId("scan-frame")).toBeNull();
  });

  it("Type it instead fires the typed-input handoff", async () => {
    const onRequestTypedInput = vi.fn();
    render(
      <FoodCameraModal
        {...props}
        loading={false}
        failure="no-food"
        onRequestTypedInput={onRequestTypedInput}
      />
    );
    await armPhoto();
    fireEvent.click(screen.getByText("Type it instead"));
    expect(onRequestTypedInput).toHaveBeenCalledTimes(1);
  });

  it("no typed-input handler, no dangling button", async () => {
    render(<FoodCameraModal {...props} loading={false} failure="no-food" />);
    await armPhoto();
    expect(screen.getByText("Retake photo")).toBeTruthy();
    expect(screen.queryByText("Type it instead")).toBeNull();
  });
});

describe("FoodCameraModal — the escape hatch", () => {
  it("Close stays live during analysis", async () => {
    // iOS has no hardware back and no Escape key — the X is the only
    // way out of a slow scan. This is the behavioural half of the
    // guard: the button must never be disabled while loading.
    const onClose = vi.fn();
    render(<FoodCameraModal {...props} onClose={onClose} loading />);
    await armPhoto();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the top bar rides ABOVE the analysis overlay (z-30 over z-20)", async () => {
    // The structural half. jsdom cannot hit-test stacking contexts,
    // so this pins the class relationship the fix consists of: the
    // close control's bar must carry a HIGHER z-class than the
    // overlay, or on real devices the overlay swallows every tap.
    // Pre-fix the bar sat at z-10 under the z-20 overlay.
    render(<FoodCameraModal {...props} loading />);
    await armPhoto();
    const bar = screen.getByLabelText("Close").closest(".z-30");
    expect(bar).not.toBeNull();
  });
});

/**
 * FoodCameraModal — the analysis-in-flight state.
 *
 * Pins a bug that shipped for as long as the scan feature has existed.
 * The modal is `fixed inset-0` and opaque, and `FoodAnalyzer` only
 * closes it AFTER the await:
 *
 *     await analyzeFood(base64);
 *     setCameraOpen(false);
 *
 * so the modal covers the whole screen for the entire Gemini round-trip
 * — several seconds. FoodAnalyzer's own "Analyzing…" spinner renders on
 * the page UNDERNEATH it and is never seen. The modal took a `loading`
 * prop already, but used it only to `disabled` the shutter, so the sole
 * signal reaching the user was the controls going dead: a freeze, not
 * work in progress.
 *
 * The camera itself is irrelevant to this contract, so getUserMedia is
 * stubbed to a state the component tolerates rather than driven.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FoodCameraModal from "../FoodCameraModal";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new Error("no camera in jsdom")),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = {
  open: true,
  onClose: vi.fn(),
  onCaptureBase64: vi.fn().mockResolvedValue(undefined),
  onBarcodeDetected: vi.fn().mockResolvedValue(undefined),
};

describe("FoodCameraModal — analysis in flight", () => {
  it("tells the user something is happening while loading", () => {
    render(<FoodCameraModal {...props} loading />);
    // A live region, so the state is announced rather than only drawn.
    const status = screen.getAllByRole("status");
    expect(status.length).toBeGreaterThan(0);
    expect(screen.getByText(/analysing|analyzing/i)).toBeTruthy();
  });

  it("says nothing when idle — the overlay is not always-on", () => {
    render(<FoodCameraModal {...props} loading={false} />);
    expect(screen.queryByText(/analysing|analyzing/i)).toBeNull();
  });

  it("names the wait for screen readers, not just sighted users", () => {
    render(<FoodCameraModal {...props} loading />);
    expect(screen.getByLabelText(/analyzing food/i)).toBeTruthy();
  });
});

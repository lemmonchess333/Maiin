/**
 * FoodCameraModal — a barcode the food database does not have (F2d).
 *
 * It used to be a toast and nothing else: close the scanner, find the
 * pencil, type a name and four numbers. The scanner now resolves in
 * place with the choice F2d locked: Describe it (primary) or Type
 * details, and Scan again for a code read by mistake.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FoodCameraModal from "../FoodCameraModal";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockReturnValue(new Promise(() => {})),
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
  loading: false,
  failure: "barcode-not-found" as const,
  initialTab: "barcode" as const,
};

describe("FoodCameraModal — a barcode with no match", () => {
  it("says so, and offers Describe it first, then Type details", () => {
    render(
      <FoodCameraModal
        {...props}
        onDescribeProduct={vi.fn()}
        onTypeProductDetails={vi.fn()}
      />
    );
    const failure = screen.getByTestId("scan-failure");
    expect(failure.textContent).toContain("No match for this barcode");
    const labels = Array.from(failure.querySelectorAll("button")).map(
      (b) => b.textContent
    );
    expect(labels).toEqual(["Describe it", "Type details", "Scan again"]);
    // The primary fill is the first button's alone.
    const [describe, details] = failure.querySelectorAll("button");
    expect(describe).toHaveClass("bg-nutrition-fill");
    expect(details).not.toHaveClass("bg-nutrition-fill");
  });

  it("hands each choice to the parent", () => {
    const onDescribeProduct = vi.fn();
    const onTypeProductDetails = vi.fn();
    const onScanRetry = vi.fn();
    render(
      <FoodCameraModal
        {...props}
        onDescribeProduct={onDescribeProduct}
        onTypeProductDetails={onTypeProductDetails}
        onScanRetry={onScanRetry}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Describe it" }));
    expect(onDescribeProduct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Type details" }));
    expect(onTypeProductDetails).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Scan again" }));
    expect(onScanRetry).toHaveBeenCalledTimes(1);
  });

  it("announces the verdict to a screen reader", () => {
    render(<FoodCameraModal {...props} />);
    expect(screen.getByTestId("scan-live-alert").textContent).toContain(
      "No match for this barcode"
    );
  });
});

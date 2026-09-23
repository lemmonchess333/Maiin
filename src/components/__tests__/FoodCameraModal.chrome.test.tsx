/**
 * FoodCameraModal — the live camera screen's controls.
 *
 *  - The selected mode is a near-white chip with dark text. It was white
 *    on the scan coral, 2.8:1, under the 4.5:1 that 14px text needs.
 *  - The modes are three nouns: Meal · Barcode · Label.
 *  - Each mode has ONE instruction, above its frame. Barcode mode used to
 *    say the same thing twice under the shutter; a line crossing the
 *    frame now says it is scanning.
 *  - Label's frame is tall, the shape of a nutrition panel.
 *  - A photo picked in Barcode mode is read on the device. It used to go
 *    to AI food analysis like the other tabs, spending a scan to come back
 *    "No food detected".
 *  - A found code turns the corners orange before the lookup, and after a
 *    failed lookup the reader scans on, past the code that failed.
 *
 * The camera stays PENDING (jsdom has no video). The barcode reader is a
 * probe: the live decoder hands its callback to the test, and the photo
 * decoder resolves to whatever the test sets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import FoodCameraModal from "../FoodCameraModal";
import { haptic } from "@/lib/haptic";

type Detected = { getText: () => string } | null;
const z = vi.hoisted(() => ({
  liveCallbacks: [] as Array<(r: Detected, e: unknown) => void>,
  decodeImage: vi.fn(),
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoElement(
      _el: unknown,
      cb: (r: Detected, e: unknown) => void
    ) {
      z.liveCallbacks.push(cb);
      return Promise.resolve({ stop: () => {} });
    }
    decodeFromImageUrl(url: string) {
      return z.decodeImage(url);
    }
  },
}));

beforeEach(() => {
  z.liveCallbacks.length = 0;
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

const baseProps = () => ({
  open: true,
  onClose: vi.fn(),
  onCaptureBase64: vi.fn().mockResolvedValue(undefined),
  onBarcodeDetected: vi.fn().mockResolvedValue(undefined),
  loading: false,
  onRequestTypedInput: vi.fn(),
});

const tab = (name: string) => screen.getByRole("button", { name });
const hint = () => screen.getByTestId("scan-hint");

function pickPhoto() {
  const input = screen.getByLabelText("Upload food photo") as HTMLInputElement;
  const file = new File(["x"], "code.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("FoodCameraModal — the mode tabs", () => {
  it("names the modes Meal, Barcode and Label", () => {
    render(<FoodCameraModal {...baseProps()} />);
    const group = screen.getByRole("group", { name: "Scan mode" });
    expect(group).toHaveTextContent("MealBarcodeLabel");
  });

  it("marks the selected mode with a near-white chip and dark text, not white on coral", () => {
    render(<FoodCameraModal {...baseProps()} />);
    const meal = tab("Meal");
    expect(meal).toHaveAttribute("aria-pressed", "true");
    expect(meal).toHaveClass("bg-stage-foreground", "text-stage");
    expect(meal.getAttribute("style")).toBeNull();
    expect(tab("Barcode")).not.toHaveClass("bg-stage-foreground");
    fireEvent.click(tab("Barcode"));
    expect(tab("Barcode")).toHaveClass("bg-stage-foreground");
    expect(tab("Meal")).not.toHaveClass("bg-stage-foreground");
  });
});

describe("FoodCameraModal — one instruction per mode, above the frame", () => {
  it("says what to fit in each frame, once", async () => {
    render(<FoodCameraModal {...baseProps()} />);
    expect(hint()).toHaveTextContent("Fit the whole plate in the frame");
    fireEvent.click(tab("Label"));
    await waitFor(() =>
      expect(hint()).toHaveTextContent("Fit the nutrition panel in the frame")
    );
    fireEvent.click(tab("Barcode"));
    await waitFor(() => expect(hint()).toHaveTextContent("Point at a barcode"));
    // No second line saying the same thing under the shutter.
    expect(screen.queryByText(/auto-detects/)).toBeNull();
    expect(screen.queryByText("Scanning…")).toBeNull();
  });

  it("gives Label a tall frame and Barcode a wide one", () => {
    render(<FoodCameraModal {...baseProps()} />);
    fireEvent.click(tab("Label"));
    expect(screen.getByTestId("scan-frame-live")).toHaveClass("aspect-[3/4]");
    fireEvent.click(tab("Barcode"));
    expect(screen.getByTestId("scan-frame-live")).toHaveClass("aspect-[4/2.3]");
  });

  it("shows a scan line in Barcode mode only", () => {
    render(<FoodCameraModal {...baseProps()} />);
    expect(screen.queryByTestId("barcode-scan-line")).toBeNull();
    fireEvent.click(tab("Barcode"));
    expect(screen.getByTestId("barcode-scan-line")).toBeTruthy();
    fireEvent.click(tab("Label"));
    expect(screen.queryByTestId("barcode-scan-line")).toBeNull();
  });
});

describe("FoodCameraModal — a photo picked in Barcode mode", () => {
  it("is read on the device, never sent for AI analysis", async () => {
    z.decodeImage.mockResolvedValue({ getText: () => "5000112637922" });
    const props = baseProps();
    render(<FoodCameraModal {...props} />);
    fireEvent.click(tab("Barcode"));
    pickPhoto();
    await waitFor(() =>
      expect(props.onBarcodeDetected).toHaveBeenCalledWith("5000112637922")
    );
    expect(props.onCaptureBase64).not.toHaveBeenCalled();
    expect(vi.mocked(haptic)).toHaveBeenCalledWith("success");
  });

  it("says so when the photo holds no barcode", async () => {
    z.decodeImage.mockRejectedValue(new Error("NotFoundException"));
    const props = baseProps();
    render(<FoodCameraModal {...props} />);
    fireEvent.click(tab("Barcode"));
    pickPhoto();
    await waitFor(() =>
      expect(hint()).toHaveTextContent("No barcode found in that photo")
    );
    expect(props.onBarcodeDetected).not.toHaveBeenCalled();
    expect(props.onCaptureBase64).not.toHaveBeenCalled();
  });

  it("in Meal mode, still goes to AI analysis", async () => {
    const props = baseProps();
    render(<FoodCameraModal {...props} />);
    pickPhoto();
    await waitFor(() =>
      expect(props.onCaptureBase64).toHaveBeenCalledWith(
        expect.any(String),
        "food"
      )
    );
    expect(z.decodeImage).not.toHaveBeenCalled();
  });
});

describe("FoodCameraModal — the live barcode reader", () => {
  it("looks a read code up, then scans on past a code whose lookup failed", async () => {
    const props = baseProps();
    render(<FoodCameraModal {...props} />);
    fireEvent.click(tab("Barcode"));
    await waitFor(() => expect(z.liveCallbacks).toHaveLength(1));

    await act(async () => {
      z.liveCallbacks[0]({ getText: () => "111" }, null);
    });
    expect(props.onBarcodeDetected).toHaveBeenCalledWith("111");
    expect(vi.mocked(haptic)).toHaveBeenCalledWith("success");

    // The lookup resolved and the scanner is still open: it failed. The
    // reader restarts, and the same code in view is not looked up again.
    await waitFor(() => expect(z.liveCallbacks).toHaveLength(2));
    await act(async () => {
      z.liveCallbacks[1]({ getText: () => "111" }, null);
    });
    expect(props.onBarcodeDetected).toHaveBeenCalledTimes(1);
    await act(async () => {
      z.liveCallbacks[1]({ getText: () => "222" }, null);
    });
    expect(props.onBarcodeDetected).toHaveBeenLastCalledWith("222");
  });

  it("holds the orange corners while the lookup runs", async () => {
    let finishLookup: () => void = () => {};
    const props = {
      ...baseProps(),
      onBarcodeDetected: vi.fn(
        () => new Promise<void>((r) => (finishLookup = r))
      ),
    };
    render(<FoodCameraModal {...props} />);
    fireEvent.click(tab("Barcode"));
    await waitFor(() => expect(z.liveCallbacks).toHaveLength(1));
    await act(async () => {
      z.liveCallbacks[0]({ getText: () => "333" }, null);
    });
    const corners = screen.getAllByTestId("scan-frame-corner");
    for (const corner of corners) {
      expect(corner.getAttribute("style")).toContain("border-color");
    }
    // The hint cross-fades to the new line.
    await waitFor(() => expect(hint()).toHaveTextContent("Found it"));
    expect(screen.queryByTestId("barcode-scan-line")).toBeNull();
    await act(async () => finishLookup());
  });
});

describe("FoodCameraModal — opening", () => {
  it("tells the page each time it comes on screen", () => {
    const onShown = vi.fn();
    const props = { ...baseProps(), open: false, onShown };
    const { rerender } = render(<FoodCameraModal {...props} />);
    expect(onShown).not.toHaveBeenCalled();
    rerender(<FoodCameraModal {...props} open />);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it("opens on the mode it is asked to, unless photo scans are locked", () => {
    const { unmount } = render(
      <FoodCameraModal {...baseProps()} initialTab="label" />
    );
    expect(tab("Label")).toHaveAttribute("aria-pressed", "true");
    unmount();
    render(
      <FoodCameraModal
        {...baseProps()}
        initialTab="label"
        photoLock={{ onUpgrade: vi.fn() }}
      />
    );
    expect(tab("Barcode")).toHaveAttribute("aria-pressed", "true");
  });
});

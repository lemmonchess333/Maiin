/**
 * FoodCameraModal — a shutter tap that takes nothing says so.
 *
 * The capture caught its own failures (no canvas context, no video) and
 * logged them, so the tap did nothing: no photo, no analysis, no word.
 * The analysis says its own failures upstream (onCaptureBase64); this is
 * only the capture. jsdom has no camera and no canvas, so the stream, its
 * playback and the 2D context are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import FoodCameraModal from "../FoodCameraModal";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/toast", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoElement() {
      return new Promise(() => {});
    }
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { hasUsedTrial: false } }),
}));

const stream = { getTracks: () => [{ stop: vi.fn() }] };

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  toastError.mockClear();
});

const props = () => ({
  open: true,
  onClose: vi.fn(),
  onCaptureBase64: vi.fn().mockResolvedValue(undefined),
  onBarcodeDetected: vi.fn().mockResolvedValue(undefined),
  loading: false,
  onRequestTypedInput: vi.fn(),
});

async function shutter() {
  const button = await screen.findByRole("button", { name: "Capture" });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("FoodCameraModal — the capture", () => {
  it("says so when no frame can be taken, and sends nothing", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const p = props();
    render(<FoodCameraModal {...p} />);
    fireEvent.click(await shutter());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't take the photo. Try again."
      )
    );
    expect(p.onCaptureBase64).not.toHaveBeenCalled();
    // And the shutter is free for another go.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Capture" })).toBeEnabled()
    );
  });

  it("sends the frame, and says nothing, when it can be taken", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,QUJD"
    );
    const p = props();
    render(<FoodCameraModal {...p} />);
    fireEvent.click(await shutter());
    await waitFor(() =>
      expect(p.onCaptureBase64).toHaveBeenCalledWith("QUJD", "food")
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});

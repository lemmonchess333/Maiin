// @vitest-environment jsdom
/**
 * A photo picked from the library goes to the analysis at the size it
 * needs, not the size it was taken.
 *
 * Sent as the file itself, a large phone photo is over the server's image
 * limit, and a request past the platform's limit is refused in front of
 * the function with no CORS headers, which the app can only read as
 * "Couldn't reach the server". So a Meal or Label pick is drawn down
 * through `encodeJpeg` (1280 px on the long side, the local copy's size)
 * and what is sent is the canvas's JPEG, never the file's bytes. A barcode
 * photo is read as taken: the reader needs its pixels. jsdom has no
 * canvas, so `encodeJpeg` is the one stub; the data URL and the base64 are
 * made by the real code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import FoodCameraModal from "../FoodCameraModal";
import { encodeJpeg } from "@/lib/imageEncode";

const toastError = vi.hoisted(() => vi.fn());
const z = vi.hoisted(() => ({ decodeImage: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoElement() {
      return new Promise(() => {});
    }
    decodeFromImageUrl(url: string) {
      return z.decodeImage(url);
    }
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { hasUsedTrial: false } }),
}));
vi.mock("@/lib/imageEncode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imageEncode")>()),
  encodeJpeg: vi.fn(),
}));

const encoded = () => ({
  blob: new Blob(["the-canvas-jpeg"], { type: "image/jpeg" }),
  width: 1280,
  height: 960,
});
const picked = () =>
  new File(["the-file-as-taken"], "IMG_0001.jpg", { type: "image/jpeg" });

function stubCamera() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockReturnValue(new Promise(() => {})),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
}

beforeEach(() => {
  stubCamera();
  vi.mocked(encodeJpeg).mockResolvedValue(encoded());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = () => ({
  open: true,
  onClose: vi.fn(),
  onCaptureBase64: vi.fn().mockResolvedValue(undefined),
  onBarcodeDetected: vi.fn().mockResolvedValue(undefined),
  loading: false,
});

const tab = (name: string) => screen.getByRole("button", { name });

function pick(file = picked()) {
  const input = screen.getByLabelText("Upload food photo") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe("FoodCameraModal — a photo from the library", () => {
  it("a Meal photo is drawn down to 1280 px and sent as the canvas's JPEG, not the file", async () => {
    const p = props();
    render(<FoodCameraModal {...p} />);
    const file = pick();
    await waitFor(() => expect(p.onCaptureBase64).toHaveBeenCalled());
    expect(encodeJpeg).toHaveBeenCalledWith(file, {
      maxEdge: 1280,
      quality: 0.85,
    });
    expect(p.onCaptureBase64).toHaveBeenCalledWith(
      btoa("the-canvas-jpeg"),
      "food"
    );
    expect(p.onCaptureBase64).not.toHaveBeenCalledWith(
      btoa("the-file-as-taken"),
      expect.anything()
    );
  });

  it("a Label photo goes the same way, as a label", async () => {
    const p = props();
    render(<FoodCameraModal {...p} />);
    fireEvent.click(tab("Label"));
    pick();
    await waitFor(() =>
      expect(p.onCaptureBase64).toHaveBeenCalledWith(
        btoa("the-canvas-jpeg"),
        "label"
      )
    );
    expect(encodeJpeg).toHaveBeenCalledTimes(1);
  });

  it("a barcode photo is read as taken: the reader needs its pixels", async () => {
    const p = props();
    z.decodeImage.mockResolvedValue({ getText: () => "5000112637922" });
    render(<FoodCameraModal {...p} />);
    fireEvent.click(tab("Barcode"));
    pick();
    await waitFor(() =>
      expect(p.onBarcodeDetected).toHaveBeenCalledWith("5000112637922")
    );
    expect(encodeJpeg).not.toHaveBeenCalled();
    expect(p.onCaptureBase64).not.toHaveBeenCalled();
    // What the reader got was the file itself, not a smaller copy.
    expect(z.decodeImage).toHaveBeenCalledWith(
      `data:image/jpeg;base64,${btoa("the-file-as-taken")}`
    );
  });

  it("a photo that cannot be drawn says so, and the next pick still works", async () => {
    const p = props();
    vi.mocked(encodeJpeg).mockRejectedValueOnce(
      new Error("photo decode failed")
    );
    render(<FoodCameraModal {...p} />);
    pick();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Couldn’t read that photo. Try another."
      )
    );
    expect(p.onCaptureBase64).not.toHaveBeenCalled();
    // The failed pick left nothing busy: the next one goes through.
    pick();
    await waitFor(() =>
      expect(p.onCaptureBase64).toHaveBeenCalledWith(
        btoa("the-canvas-jpeg"),
        "food"
      )
    );
  });
});

/**
 * FoodCameraModal — an account that has turned AI analysis off.
 *
 * Its answer was "Not now", or the Settings switch is off
 * (src/lib/aiConsent.ts). Nothing may be sent to Google, so the photo tabs
 * have no shutter and no photo library: they say AI analysis is off and
 * offer to turn it on. Barcode is not AI and works as ever.
 *
 * Same harness as the photo-lock suite: the camera is stubbed PENDING so
 * the surface stays on the camera return, and the barcode reader never
 * resolves.
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

const z = vi.hoisted(() => ({ decodeImage: vi.fn() }));
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

beforeEach(() => stubCamera("pending"));
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
  onRequestTypedInput: vi.fn(),
};

const tab = (name: string) => screen.getByRole("button", { name });

describe("FoodCameraModal — AI analysis off", () => {
  it("a photo tab says AI analysis is off, with no shutter and no photo library", async () => {
    render(<FoodCameraModal {...props} aiOff={{ onTurnOn: vi.fn() }} />);
    for (const name of ["Meal", "Label"]) {
      fireEvent.click(tab(name));
      expect(tab(name)).toHaveAttribute("aria-pressed", "true");
      expect(await screen.findByText("AI analysis is off")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Turn on AI analysis" })
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Scan a barcode" })
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Photo library" })
      ).toBeNull();
    }
  });

  it("Turn on asks; Scan a barcode goes to Barcode, which works as ever", async () => {
    const onTurnOn = vi.fn();
    render(<FoodCameraModal {...props} aiOff={{ onTurnOn }} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Turn on AI analysis" })
    );
    expect(onTurnOn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Scan a barcode" }));
    expect(tab("Barcode")).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Point at a barcode")).toBeTruthy();
    // A picked photo is read on the device in Barcode mode, so the library
    // is back.
    expect(screen.getByRole("button", { name: "Photo library" })).toBeTruthy();
  });

  it("with no camera, offers no photo upload on a photo tab", async () => {
    stubCamera("denied");
    render(<FoodCameraModal {...props} aiOff={{ onTurnOn: vi.fn() }} />);
    expect(
      await screen.findByRole("button", { name: /type it instead/i })
    ).toBeTruthy();
    expect(screen.getByText(/log your meal by typing it in/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /upload a photo instead/i })
    ).toBeNull();
  });

  it("with AI analysis allowed, the shutter is there (the prop is what removes it)", async () => {
    render(<FoodCameraModal {...props} aiOff={null} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy()
    );
    expect(screen.queryByText("AI analysis is off")).toBeNull();
  });
});

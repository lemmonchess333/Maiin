/**
 * Where to turn the camera back on, said for the place the person is in.
 * The message used to read "your device or browser settings" in the iPhone
 * app too, which reads as a web page in an app (launch audit, 2026-11-18;
 * Guideline 2.3.10, 4.2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoElement() {
      return new Promise(() => {});
    }
    decodeFromImageUrl() {
      return Promise.reject(new Error("no barcode"));
    }
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { hasUsedTrial: false } }),
}));
const nativeMock = vi.fn(() => false);
vi.mock("@/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform")>()),
  isNativePlatform: () => nativeMock(),
}));

import FoodCameraModal from "../FoodCameraModal";

function denyCamera() {
  const refusal = Object.assign(new Error("denied"), {
    name: "NotAllowedError",
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(refusal),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
}

const props = {
  open: true,
  onClose: vi.fn(),
  onCaptureBase64: vi.fn().mockResolvedValue(undefined),
  onBarcodeDetected: vi.fn().mockResolvedValue(undefined),
  loading: false,
  onRequestTypedInput: vi.fn(),
};

beforeEach(() => {
  denyCamera();
  nativeMock.mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FoodCameraModal: camera access refused", () => {
  it("in the app, names Settings and no browser", async () => {
    nativeMock.mockReturnValue(true);
    const { container } = render(<FoodCameraModal {...props} />);
    expect(
      await screen.findByText(
        "To turn it back on, allow the camera for Tropos in Settings."
      )
    ).toBeTruthy();
    expect(container.textContent).not.toMatch(/browser/i);
  });

  it("on the web, names the browser's settings", async () => {
    render(<FoodCameraModal {...props} />);
    expect(
      await screen.findByText(
        "To turn it back on, allow the camera for Tropos in your browser’s settings."
      )
    ).toBeTruthy();
  });
});

/**
 * FoodCameraModal — an account whose tier has no photo scans.
 *
 * Barcode scanning is free (F2b in the plan file). The Food page's Scan
 * button opens this scanner for every account, and the scanner holds the
 * line: a locked account lands on Barcode, the photo tabs show the Pro
 * offer where the shutter would be, and nothing offers a photo upload,
 * because every photo goes to AI analysis, whichever tab it came from.
 *
 * The camera is stubbed PENDING so the surface stays on the camera
 * return; the blocked-branch tests reject it instead. The barcode reader
 * is stubbed to a decoder that never resolves: jsdom has no video.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FoodCameraModal from "../FoodCameraModal";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/backDismiss", () => ({ useBackDismiss: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoElement() {
      return new Promise(() => {});
    }
  },
}));
const profileMock = vi.fn<() => Record<string, unknown> | null>(() => null);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: profileMock() }),
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

beforeEach(() => {
  stubCamera("pending");
  profileMock.mockReturnValue({ hasUsedTrial: false });
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
  onRequestTypedInput: vi.fn(),
};

const tab = (name: string) => screen.getByRole("button", { name });

describe("FoodCameraModal — photo scanning not on the tier", () => {
  it("opens on Barcode, with no photo library and no shutter", () => {
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade: vi.fn() }} />);
    expect(tab("Barcode")).toHaveAttribute("aria-pressed", "true");
    expect(tab("Scan Food")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Aim at the barcode · auto-detects")).toBeTruthy();
    // A picked photo goes to AI analysis from any tab, so the library
    // button is gone, not just disabled.
    expect(screen.queryByRole("button", { name: "Photo library" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
  });

  it("a photo tab shows the Pro offer where the shutter would be", async () => {
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade: vi.fn() }} />);
    for (const name of ["Scan Food", "Food label"]) {
      fireEvent.click(tab(name));
      expect(tab(name)).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Photo library" })
      ).toBeNull();
      // The line under the shutter row cross-fades between tabs.
      expect(
        await screen.findByText("Photo scanning is part of Pro")
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Scan a barcode" })
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try Pro free" })).toBeTruthy();
    }
  });

  it("the offer's buttons: Pro hands off to the page, Scan a barcode goes back to Barcode", async () => {
    const onUpgrade = vi.fn();
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade }} />);
    fireEvent.click(tab("Scan Food"));
    fireEvent.click(screen.getByRole("button", { name: "Try Pro free" }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Scan a barcode" }));
    expect(tab("Barcode")).toHaveAttribute("aria-pressed", "true");
    expect(
      await screen.findByText("Aim at the barcode · auto-detects")
    ).toBeTruthy();
  });

  it("names the offer the way the Pro line under the composer does once the trial is used", () => {
    profileMock.mockReturnValue({ hasUsedTrial: true });
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade: vi.fn() }} />);
    fireEvent.click(tab("Scan Food"));
    expect(screen.getByRole("button", { name: "See Pro" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try Pro free" })).toBeNull();
  });

  it("with the camera denied, offers typing but not a photo upload", async () => {
    stubCamera("denied");
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade: vi.fn() }} />);
    expect(
      await screen.findByRole("button", { name: /type it instead/i })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /upload a photo instead/i })
    ).toBeNull();
  });
});

describe("FoodCameraModal — photo scanning on the tier (unchanged)", () => {
  it("opens on Scan Food with the shutter and the photo library", () => {
    render(<FoodCameraModal {...props} />);
    expect(tab("Scan Food")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photo library" })).toBeTruthy();
    expect(screen.getByText("Point at your meal")).toBeTruthy();
    expect(screen.queryByText("Photo scanning is part of Pro")).toBeNull();
  });

  it("with the camera denied, still offers a photo upload", async () => {
    stubCamera("denied");
    render(<FoodCameraModal {...props} />);
    expect(
      await screen.findByRole("button", { name: /upload a photo instead/i })
    ).toBeTruthy();
  });
});

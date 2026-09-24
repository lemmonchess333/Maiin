/**
 * FoodCameraModal — an account whose tier has no photo scans.
 *
 * Barcode scanning is free (F2b in the plan file). The Food page's camera
 * button opens this scanner for every account, and the scanner holds the
 * line: a locked account lands on Barcode, the photo tabs show the Pro
 * offer where the shutter would be, and the photo library is offered only
 * in Barcode mode, where a picked photo is read on the device instead of
 * going to AI analysis.
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
  it("opens on Barcode, with the photo library and no shutter", () => {
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade: vi.fn() }} />);
    expect(tab("Barcode")).toHaveAttribute("aria-pressed", "true");
    expect(tab("Meal")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Point at a barcode")).toBeTruthy();
    // In Barcode mode a picked photo is read on the device, which is free.
    expect(screen.getByRole("button", { name: "Photo library" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
  });

  it("a photo tab shows the Pro offer where the shutter would be", async () => {
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade: vi.fn() }} />);
    for (const name of ["Meal", "Label"]) {
      fireEvent.click(tab(name));
      expect(tab(name)).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Photo library" })
      ).toBeNull();
      // The hint above the frame cross-fades between tabs.
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
    fireEvent.click(tab("Meal"));
    fireEvent.click(screen.getByRole("button", { name: "Try Pro free" }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Scan a barcode" }));
    expect(tab("Barcode")).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Point at a barcode")).toBeTruthy();
  });

  it("names the offer the way the Pro line under the composer does once the trial is used", () => {
    profileMock.mockReturnValue({ hasUsedTrial: true });
    render(<FoodCameraModal {...props} photoLock={{ onUpgrade: vi.fn() }} />);
    fireEvent.click(tab("Meal"));
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
  it("opens on Meal with the shutter and the photo library", () => {
    render(<FoodCameraModal {...props} />);
    expect(tab("Meal")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photo library" })).toBeTruthy();
    expect(screen.getByText("Fit the whole plate in the frame")).toBeTruthy();
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

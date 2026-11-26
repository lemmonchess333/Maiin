import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  importGpxRun: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/gpxImport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gpxImport")>();
  return {
    ...actual,
    importGpxRun: (...args: unknown[]) => mocks.importGpxRun(...args),
  };
});

vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { GpxImportError } from "@/lib/gpxImport";
import DataImportSection from "../DataImportSection";

const USER = { uid: "u-1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DataImportSection", () => {
  it("renders the Import GPX run action", () => {
    render(<DataImportSection user={USER} />);
    expect(
      screen.getByRole("button", { name: /import gpx run/i })
    ).toBeInTheDocument();
  });

  it("imports a selected GPX file and reports the distance in the user’s unit", async () => {
    mocks.importGpxRun.mockResolvedValue({
      runId: "gpx-12345678",
      name: "Morning 5K",
      distance: 5020,
      duration: 1500,
      date: "2026-10-12",
      hasHeartRate: true,
    });

    const { container } = render(
      <DataImportSection
        user={USER}
        distanceUnit="km"
        weightKg={72}
        maxHeartRate={190}
        age={30}
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["<gpx></gpx>"], "run.gpx", {
      type: "application/gpx+xml",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.importGpxRun).toHaveBeenCalledWith("u-1", "<gpx></gpx>", {
        weightKg: 72,
        maxHr: 190,
        age: 30,
      })
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 5.02 km run")
    );
  });

  it("surfaces GpxImportError messages directly to the user", async () => {
    mocks.importGpxRun.mockRejectedValue(
      new GpxImportError(
        "GPX_INVALID_XML",
        "This file isn’t a valid GPX track."
      )
    );

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["not gpx"], "bad.gpx", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "This file isn’t a valid GPX track."
      )
    );
  });

  it("rejects oversized files before reading them", async () => {
    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const bigFile = new File(["x"], "huge.gpx", {
      type: "application/gpx+xml",
    });
    Object.defineProperty(bigFile, "size", { value: 20 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "This file is too large to import."
      )
    );
    expect(mocks.importGpxRun).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  importGpxRun: vi.fn(),
  importWorkoutsCsv: vi.fn(),
  importBodyweightCsv: vi.fn(),
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

vi.mock("@/lib/workoutCsvImport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/workoutCsvImport")>();
  return {
    ...actual,
    importWorkoutsCsv: (...args: unknown[]) => mocks.importWorkoutsCsv(...args),
  };
});

vi.mock("@/lib/bodyweightCsvImport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/bodyweightCsvImport")>();
  return {
    ...actual,
    importBodyweightCsv: (...args: unknown[]) =>
      mocks.importBodyweightCsv(...args),
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
import { WorkoutCsvImportError } from "@/lib/workoutCsvImport";
import { BodyweightCsvImportError } from "@/lib/bodyweightCsvImport";
import DataImportSection from "../DataImportSection";

const USER = { uid: "u-1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DataImportSection", () => {
  it("renders GPX run, lifting CSV, and weight CSV import actions", () => {
    render(<DataImportSection user={USER} />);
    expect(
      screen.getByRole("button", { name: /import gpx run/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import lifting csv/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import weight csv/i })
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
      'input[data-import-kind="gpx"]'
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
      'input[data-import-kind="gpx"]'
    ) as HTMLInputElement;
    const file = new File(["not gpx"], "bad.gpx", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "This file isn’t a valid GPX track."
      )
    );
  });

  it("rejects oversized GPX files before reading them", async () => {
    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="gpx"]'
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

  it("imports a selected lifting CSV file and reports workout count", async () => {
    mocks.importWorkoutsCsv.mockResolvedValue({
      source: "hevy",
      importedCount: 3,
      totalSets: 42,
      earliestDate: "2026-10-01",
      latestDate: "2026-10-12",
    });

    const { container } = render(
      <DataImportSection user={USER} liftWeightUnit="lbs" weightKg={80} />
    );
    const input = container.querySelector(
      'input[data-import-kind="workout-csv"]'
    ) as HTMLInputElement;
    const file = new File(["Date,Exercise\n"], "hevy.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.importWorkoutsCsv).toHaveBeenCalledWith(
        "u-1",
        "Date,Exercise\n",
        {
          weightKg: 80,
          defaultWeightUnit: "lbs",
        }
      )
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 3 workouts")
    );
  });

  it("surfaces WorkoutCsvImportError messages directly to the user", async () => {
    mocks.importWorkoutsCsv.mockRejectedValue(
      new WorkoutCsvImportError(
        "CSV_UNRECOGNIZED_FORMAT",
        "Couldn’t recognise this CSV format. Export workouts from Hevy, Strong or Tropos and try again."
      )
    );

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="workout-csv"]'
    ) as HTMLInputElement;
    const file = new File(["foo,bar"], "bad.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Couldn’t recognise this CSV format. Export workouts from Hevy, Strong or Tropos and try again."
      )
    );
  });

  it("imports a selected weight CSV file and reports weigh-in count", async () => {
    mocks.importBodyweightCsv.mockResolvedValue({
      importedCount: 14,
      earliestDate: "2026-10-01",
      latestDate: "2026-10-14",
    });

    const { container } = render(
      <DataImportSection user={USER} bodyWeightUnit="lbs" />
    );
    const input = container.querySelector(
      'input[data-import-kind="weight-csv"]'
    ) as HTMLInputElement;
    const file = new File(["Date,Weight\n"], "weights.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.importBodyweightCsv).toHaveBeenCalledWith(
        "u-1",
        "Date,Weight\n",
        {
          defaultWeightUnit: "lbs",
        }
      )
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 14 weigh-ins")
    );
  });

  it("surfaces BodyweightCsvImportError messages directly to the user", async () => {
    mocks.importBodyweightCsv.mockRejectedValue(
      new BodyweightCsvImportError(
        "CSV_NO_ENTRIES",
        "No valid weigh-ins were found in this CSV file."
      )
    );

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="weight-csv"]'
    ) as HTMLInputElement;
    const file = new File(["Date,Weight\n"], "empty.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "No valid weigh-ins were found in this CSV file."
      )
    );
  });
});

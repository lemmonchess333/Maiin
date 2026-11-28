import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  importRunFile: vi.fn(),
  importWorkoutsCsv: vi.fn(),
  importBodyweightCsv: vi.fn(),
  importNutritionCsv: vi.fn(),
  importFullBackupJson: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/gpxImport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gpxImport")>();
  return {
    ...actual,
    importRunFile: (...args: unknown[]) => mocks.importRunFile(...args),
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

vi.mock("@/lib/nutritionCsvImport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/nutritionCsvImport")>();
  return {
    ...actual,
    importNutritionCsv: (...args: unknown[]) =>
      mocks.importNutritionCsv(...args),
  };
});

vi.mock("@/lib/jsonArchiveImport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/jsonArchiveImport")>();
  return {
    ...actual,
    importFullBackupJson: (...args: unknown[]) =>
      mocks.importFullBackupJson(...args),
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
import { NutritionCsvImportError } from "@/lib/nutritionCsvImport";
import { JsonArchiveImportError } from "@/lib/jsonArchiveImport";
import DataImportSection from "../DataImportSection";

const USER = { uid: "u-1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DataImportSection", () => {
  it("renders GPX/TCX run, lifting CSV, weight CSV, nutrition CSV, and backup JSON import actions", () => {
    render(<DataImportSection user={USER} />);
    expect(
      screen.getByRole("button", { name: /import gpx or tcx run/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import lifting csv/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import weight csv/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import nutrition csv/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import backup json/i })
    ).toBeInTheDocument();
  });

  it("imports a selected GPX or TCX file and reports the distance in the user’s unit", async () => {
    mocks.importRunFile.mockResolvedValue({
      runId: "tcx-12345678",
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
    expect(input.accept).toContain(".tcx");
    const file = new File(
      ["<TrainingCenterDatabase></TrainingCenterDatabase>"],
      "run.tcx",
      {
        type: "application/vnd.garmin.tcx+xml",
      }
    );
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.importRunFile).toHaveBeenCalledWith(
        "u-1",
        "<TrainingCenterDatabase></TrainingCenterDatabase>",
        {
          weightKg: 72,
          maxHr: 190,
          age: 30,
        }
      )
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 5.02 km run")
    );
  });

  it("surfaces GpxImportError messages directly to the user", async () => {
    mocks.importRunFile.mockRejectedValue(
      new GpxImportError(
        "GPX_INVALID_XML",
        "This file isn’t a valid GPX or TCX run."
      )
    );

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="gpx"]'
    ) as HTMLInputElement;
    const file = new File(["not gpx"], "bad.tcx", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "This file isn’t a valid GPX or TCX run."
      )
    );
  });

  it("rejects oversized GPX/TCX files before reading them", async () => {
    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="gpx"]'
    ) as HTMLInputElement;
    const bigFile = new File(["x"], "huge.tcx", {
      type: "application/xml",
    });
    Object.defineProperty(bigFile, "size", { value: 20 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "This file is too large to import."
      )
    );
    expect(mocks.importRunFile).not.toHaveBeenCalled();
  });

  it("imports multiple selected GPX/TCX files in one batch", async () => {
    mocks.importRunFile.mockResolvedValue({
      runId: "gpx-1",
      name: "Run",
      distance: 5000,
      duration: 1500,
      date: "2026-10-12",
      hasHeartRate: false,
    });

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="gpx"]'
    ) as HTMLInputElement;
    expect(input.multiple).toBe(true);

    const files = [
      new File(["<gpx>1</gpx>"], "a.gpx", { type: "application/gpx+xml" }),
      new File(["<gpx>2</gpx>"], "b.tcx", { type: "application/xml" }),
      new File(["<gpx>3</gpx>"], "c.gpx", { type: "application/gpx+xml" }),
    ];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(mocks.importRunFile).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 3 runs")
    );
  });

  it("skips invalid or oversized files in a multi-file batch and reports the summary", async () => {
    mocks.importRunFile
      .mockResolvedValueOnce({
        runId: "gpx-1",
        name: "Run 1",
        distance: 5000,
        duration: 1500,
        date: "2026-10-12",
        hasHeartRate: false,
      })
      .mockRejectedValueOnce(
        new GpxImportError("GPX_INVALID_XML", "Invalid GPX")
      )
      .mockResolvedValueOnce({
        runId: "gpx-2",
        name: "Run 2",
        distance: 8000,
        duration: 2400,
        date: "2026-10-13",
        hasHeartRate: false,
      });

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="gpx"]'
    ) as HTMLInputElement;
    const huge = new File(["x"], "huge.gpx", { type: "application/gpx+xml" });
    Object.defineProperty(huge, "size", { value: 20 * 1024 * 1024 });

    fireEvent.change(input, {
      target: {
        files: [
          new File(["<gpx>1</gpx>"], "ok1.gpx", {
            type: "application/gpx+xml",
          }),
          new File(["bad"], "bad.gpx", { type: "application/gpx+xml" }),
          huge,
          new File(["<gpx>2</gpx>"], "ok2.tcx", { type: "application/xml" }),
        ],
      },
    });

    await waitFor(() => expect(mocks.importRunFile).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Imported 2 runs (2 skipped)"
      )
    );
  });

  it("shows an error toast when every file in a multi-file run batch fails", async () => {
    mocks.importRunFile.mockRejectedValue(
      new GpxImportError("GPX_INVALID_XML", "Invalid GPX")
    );

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="gpx"]'
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File(["bad1"], "bad1.gpx", { type: "application/gpx+xml" }),
          new File(["bad2"], "bad2.tcx", { type: "application/xml" }),
        ],
      },
    });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Couldn’t import any of these run files."
      )
    );
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
        expect.objectContaining({
          weightKg: 80,
          defaultWeightUnit: "lbs",
          onProgress: expect.any(Function),
        })
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
        expect.objectContaining({
          defaultWeightUnit: "lbs",
          onProgress: expect.any(Function),
        })
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

  it("restores a selected backup JSON file and reports total record count", async () => {
    mocks.importFullBackupJson.mockResolvedValue({
      workouts: 4,
      runs: 3,
      meals: 12,
      bodyweight: 7,
      totalItems: 26,
    });

    const { container } = render(
      <DataImportSection user={USER} weightKg={78} />
    );
    const input = container.querySelector(
      'input[data-import-kind="archive-json"]'
    ) as HTMLInputElement;
    const file = new File(['{"schemaVersion":1}'], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.importFullBackupJson).toHaveBeenCalledWith(
        "u-1",
        '{"schemaVersion":1}',
        expect.objectContaining({
          weightKg: 78,
          onProgress: expect.any(Function),
        })
      )
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Restored 26 records from backup"
      )
    );
  });

  it("surfaces JsonArchiveImportError messages directly to the user", async () => {
    mocks.importFullBackupJson.mockRejectedValue(
      new JsonArchiveImportError(
        "ARCHIVE_INVALID_JSON",
        "This file isn’t a valid JSON backup."
      )
    );

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="archive-json"]'
    ) as HTMLInputElement;
    const file = new File(["{bad"], "bad.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "This file isn’t a valid JSON backup."
      )
    );
  });

  it("imports a selected nutrition CSV file and reports meal count", async () => {
    mocks.importNutritionCsv.mockResolvedValue({
      importedCount: 8,
      earliestDate: "2026-10-18",
      latestDate: "2026-10-21",
    });

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="nutrition-csv"]'
    ) as HTMLInputElement;
    const file = new File(["Date,Meal,Calories\n"], "meals.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.importNutritionCsv).toHaveBeenCalledWith(
        "u-1",
        "Date,Meal,Calories\n",
        expect.objectContaining({
          onProgress: expect.any(Function),
        })
      )
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 8 meals")
    );
  });

  it("surfaces NutritionCsvImportError messages directly to the user", async () => {
    mocks.importNutritionCsv.mockRejectedValue(
      new NutritionCsvImportError(
        "CSV_NO_ENTRIES",
        "No valid meal entries were found in this CSV."
      )
    );

    const { container } = render(<DataImportSection user={USER} />);
    const input = container.querySelector(
      'input[data-import-kind="nutrition-csv"]'
    ) as HTMLInputElement;
    const file = new File(["Date,Meal,Calories\n"], "empty.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "No valid meal entries were found in this CSV."
      )
    );
  });
});

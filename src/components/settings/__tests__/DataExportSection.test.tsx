/**
 * DataExportSection — CSV export, now that something renders it.
 *
 * Built over `src/lib/export.ts` and reached by nothing (#1921), while the
 * Account page's own subtitle has read "Sign-in, data export, delete account"
 * the whole time. The page advertised a feature it did not render.
 *
 * Taking your data out is a user right rather than a nicety, so the
 * assertions are about the export ACTUALLY happening for the signed-in user
 * and failing loudly when it doesn't — a silent no-op here looks identical to
 * a working button, which is exactly how it stayed unnoticed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const exportWorkoutsCSV = vi.fn().mockResolvedValue("w-csv");
const exportMealsCSV = vi.fn().mockResolvedValue("m-csv");
const exportBodyweightCSV = vi.fn().mockResolvedValue("b-csv");
const downloadCSV = vi.fn();
vi.mock("@/lib/export", () => ({
  exportWorkoutsCSV: (...a: unknown[]) => exportWorkoutsCSV(...a),
  exportMealsCSV: (...a: unknown[]) => exportMealsCSV(...a),
  exportBodyweightCSV: (...a: unknown[]) => exportBodyweightCSV(...a),
  downloadCSV: (...a: unknown[]) => downloadCSV(...a),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import DataExportSection from "../DataExportSection";

const USER = { uid: "u1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DataExportSection", () => {
  it("offers all three exports", () => {
    render(<DataExportSection user={USER} />);
    for (const label of [
      /export workouts/i,
      /export meals/i,
      /export bodyweight/i,
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("exports for the SIGNED-IN uid and hands the CSV to the downloader", async () => {
    // The uid is the whole correctness question: exporting the wrong
    // user's data is a privacy incident, not a bug.
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export workouts/i }));

    await waitFor(() => expect(exportWorkoutsCSV).toHaveBeenCalledWith("u1"));
    await waitFor(() =>
      expect(downloadCSV).toHaveBeenCalledWith(
        "w-csv",
        expect.stringContaining("tropos-workouts-")
      )
    );
    expect(exportMealsCSV).not.toHaveBeenCalled();
    expect(exportBodyweightCSV).not.toHaveBeenCalled();
  });

  it("routes each button to its OWN exporter", async () => {
    // Three near-identical buttons built from one map — a copy-paste slip
    // that exported meals under the bodyweight label would be invisible.
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export bodyweight/i }));
    await waitFor(() => expect(exportBodyweightCSV).toHaveBeenCalledWith("u1"));
    expect(exportWorkoutsCSV).not.toHaveBeenCalled();
  });

  it("tells the user when an export fails instead of failing silently", async () => {
    exportWorkoutsCSV.mockRejectedValueOnce(new Error("network"));
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export workouts/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(downloadCSV).not.toHaveBeenCalled();
  });

  it("does nothing when signed out, rather than exporting an empty file", async () => {
    render(<DataExportSection user={null} />);
    fireEvent.click(screen.getByRole("button", { name: /export workouts/i }));

    await waitFor(() => expect(exportWorkoutsCSV).not.toHaveBeenCalled());
    expect(downloadCSV).not.toHaveBeenCalled();
  });
});

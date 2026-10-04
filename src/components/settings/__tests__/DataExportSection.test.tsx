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
 *
 * It did stay a silent no-op on the iPhone for a while: the CSV went out as
 * a blob `<a download>`, which WKWebView drops, and the page still said
 * "exported". The file now goes through shareFile (the share sheet, or a
 * download on the web), and "exported" is said only when it was shared or
 * downloaded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { isTitleCase } from "@/lib/__tests__/copyCasing.test";

const exportWorkoutsCSV = vi.fn().mockResolvedValue("w-csv");
const exportMealsCSV = vi.fn().mockResolvedValue("m-csv");
const exportBodyweightCSV = vi.fn().mockResolvedValue("b-csv");
vi.mock("@/lib/export", () => ({
  exportWorkoutsCSV: (...a: unknown[]) => exportWorkoutsCSV(...a),
  exportMealsCSV: (...a: unknown[]) => exportMealsCSV(...a),
  exportBodyweightCSV: (...a: unknown[]) => exportBodyweightCSV(...a),
  csvFile: (content: string, name: string) =>
    new File([content], name, { type: "text/csv" }),
}));

const shareFile = vi.fn();
vi.mock("@/lib/shareFile", () => ({
  shareFile: (...a: unknown[]) => shareFile(...a),
}));

const toastPlain = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: Object.assign((...a: unknown[]) => toastPlain(...a), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import DataExportSection from "../DataExportSection";

const USER = { uid: "u1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
  shareFile.mockResolvedValue("shared");
});

/** The File handed to shareFile on its nth call. */
function sharedFile(n = 0): File {
  return shareFile.mock.calls[n][0] as File;
}

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

  it("names them in sentence case, like the rows either side", () => {
    /* These three sat in Title Case between "Change password" above and
       "Sign out" below, on a page where nothing else is capitalised that
       way. The repo-wide guard could not see them: it reads JSX text and
       label PROPS, and these labels live in an object literal that a
       `.map()` renders. Held here, at the site, because extending the
       guard to object literals is not worth it — measured, 34 such
       Title Case labels across src/ and 31 are exercise names, Circle
       types, training-block presets or run-cue coach speech, all of
       which are correct as they are. */
    render(<DataExportSection user={USER} />);
    for (const button of screen.getAllByRole("button")) {
      const name = button.textContent?.trim() ?? "";
      expect(isTitleCase(name), `"${name}" is Title Case`).toBe(false);
      expect(name).toMatch(/^Export [a-z]/);
    }
  });

  it("exports for the SIGNED-IN uid and hands the CSV over as a file", async () => {
    // The uid is the whole correctness question: exporting the wrong
    // user's data is a privacy incident, not a bug.
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export workouts/i }));

    await waitFor(() => expect(exportWorkoutsCSV).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(shareFile).toHaveBeenCalledOnce());
    const file = sharedFile();
    expect(file.name).toMatch(/^tropos-workouts-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.type).toBe("text/csv");
    expect(await file.text()).toBe("w-csv");
    expect(exportMealsCSV).not.toHaveBeenCalled();
    expect(exportBodyweightCSV).not.toHaveBeenCalled();
  });

  it("routes each button to its OWN exporter", async () => {
    // Three near-identical buttons built from one map — a copy-paste slip
    // that exported meals under the bodyweight label would be invisible.
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export bodyweight/i }));
    await waitFor(() => expect(exportBodyweightCSV).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(shareFile).toHaveBeenCalledOnce());
    expect(sharedFile().name).toMatch(/^tropos-bodyweight-/);
    expect(exportWorkoutsCSV).not.toHaveBeenCalled();
  });

  it.each(["shared", "downloaded"])(
    "says exported once the file was %s",
    async (outcome) => {
      shareFile.mockResolvedValue(outcome);
      render(<DataExportSection user={USER} />);
      fireEvent.click(screen.getByRole("button", { name: /export meals/i }));
      await waitFor(() =>
        expect(toastSuccess).toHaveBeenCalledWith("Meals exported")
      );
      expect(toastError).not.toHaveBeenCalled();
    }
  );

  it("says nothing when the share sheet is dismissed", async () => {
    shareFile.mockResolvedValue("cancelled");
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export meals/i }));
    await waitFor(() => expect(shareFile).toHaveBeenCalledOnce());
    // The row is back from "Exporting…" once the handover has settled.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /export meals/i })
      ).not.toBeDisabled()
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(toastPlain).not.toHaveBeenCalled();
  });

  it("says so when nothing could be shared or saved", async () => {
    shareFile.mockResolvedValue("failed");
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export meals/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't export your data. Try again."
      )
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("offers a Share button when the sheet needed a fresh tap, and that tap shares the same file", async () => {
    /* The export reads Firestore before it can share; on an iPhone the
       tap can have expired by then, and only a new one opens the sheet. */
    shareFile.mockResolvedValueOnce("blocked").mockResolvedValueOnce("shared");
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export workouts/i }));

    await waitFor(() => expect(toastPlain).toHaveBeenCalledOnce());
    const [message, options] = toastPlain.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Workouts export ready");
    expect(options.action.label).toBe("Share");
    expect(toastSuccess).not.toHaveBeenCalled();

    options.action.onClick();
    await waitFor(() => expect(shareFile).toHaveBeenCalledTimes(2));
    expect(sharedFile(1)).toBe(sharedFile(0));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Workouts exported")
    );
    // The Firestore read is not repeated for the second tap.
    expect(exportWorkoutsCSV).toHaveBeenCalledOnce();
  });

  it("tells the user when an export fails instead of failing silently", async () => {
    exportWorkoutsCSV.mockRejectedValueOnce(new Error("network"));
    render(<DataExportSection user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /export workouts/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(shareFile).not.toHaveBeenCalled();
  });

  it("does nothing when signed out, rather than exporting an empty file", async () => {
    render(<DataExportSection user={null} />);
    fireEvent.click(screen.getByRole("button", { name: /export workouts/i }));

    await waitFor(() => expect(exportWorkoutsCSV).not.toHaveBeenCalled());
    expect(shareFile).not.toHaveBeenCalled();
  });
});

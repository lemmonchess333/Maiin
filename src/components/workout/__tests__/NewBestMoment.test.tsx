/**
 * The new-best moment (DS3): the finish screen's New bests row, said on
 * the workout screen as the set is ticked. What it shows, what a screen
 * reader hears, and that Reduce Motion gets it without movement.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NewBestMoment, { type NewBest } from "../NewBestMoment";
import { localDateString } from "@/lib/dateHelpers";

function moment(previousDate = "2026-07-01"): NewBest {
  return {
    setKey: "0:1",
    exerciseId: "bench-press",
    exerciseName: "Bench Press",
    result: {
      kind: "best",
      bucket: "8rm",
      weight: 82.5,
      reps: 8,
      previousBest: { weight: 80, reps: 8, date: previousDate },
    },
  };
}

function reduceMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query.includes("reduce"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewBestMoment", () => {
  it("names the lift, the figure it set, and the best it beat", () => {
    render(<NewBestMoment moment={moment()} />);
    const card = screen.getByTestId("new-best-moment");
    expect(card).toHaveTextContent("New best");
    expect(card).toHaveTextContent("Bench Press");
    expect(screen.getByText("82.5 kg × 8")).toBeInTheDocument();
    expect(screen.getByText(/^Was\b/).textContent).toBe("Was 80 kg × 8, 1 Jul");
  });

  it("says 'today' when the beaten best was an earlier set of this session", () => {
    render(<NewBestMoment moment={moment(localDateString())} />);
    expect(screen.getByText(/^Was\b/).textContent).toBe("Was 80 kg × 8, today");
  });

  it("leaves the date off rather than print one that does not parse", () => {
    render(<NewBestMoment moment={moment("sometime")} />);
    expect(screen.getByText(/^Was\b/).textContent).toBe("Was 80 kg × 8");
  });

  it("is announced in words through a status line that is always there", () => {
    const { rerender } = render(<NewBestMoment moment={null} />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    expect(screen.queryByTestId("new-best-moment")).toBeNull();

    rerender(<NewBestMoment moment={moment()} />);
    // The same element: a region that arrives with its text is not
    // reliably read, so the text changes inside one that was waiting.
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe(
      "New best on Bench Press: 82.5 kg for 8 reps. Previous best 80 kg for 8 reps."
    );
  });

  it("carries an Undo only while it is handed one", () => {
    const onUndo = vi.fn();
    const { rerender } = render(<NewBestMoment moment={moment()} />);
    expect(screen.queryByRole("button", { name: "Undo this set" })).toBeNull();
    rerender(<NewBestMoment moment={moment()} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo this set" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("paints the figure and chip in the gold text step, never the bare gold", () => {
    render(<NewBestMoment moment={moment()} />);
    expect(screen.getByText("82.5 kg × 8")).toHaveClass(
      "text-achievement-strong"
    );
    expect(screen.getByText("New best")).toHaveClass("text-achievement-strong");
  });

  it("enters with a small scale and fade when motion is allowed", () => {
    reduceMotion(false);
    render(<NewBestMoment moment={moment()} />);
    expect(screen.getByTestId("new-best-moment").style.opacity).toBe("0");
  });

  it("appears without moving under Reduce Motion", () => {
    reduceMotion(true);
    render(<NewBestMoment moment={moment()} />);
    const card = screen.getByTestId("new-best-moment");
    expect(card.style.opacity).toBe("1");
    expect(card.style.transform).not.toMatch(/scale\(0\.9/);
  });
});

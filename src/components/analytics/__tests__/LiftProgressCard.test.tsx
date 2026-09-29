import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LiftProgressCard from "../LiftProgressCard";
import type { LiftProgressRow, TopSet } from "@/lib/liftProgress";
import { epley1RMExact } from "@/lib/analytics";

/**
 * "Your lifts" (DS3): each main lift's latest top set and where it came
 * from, in sets the user lifted. What it must never do: call a lift that
 * has stopped moving anything but that, or put gold on a set that is not
 * a new best.
 */

const set = (weight: number, reps: number, date: string): TopSet => ({
  weight,
  reps,
  date,
  e1rm: epley1RMExact(weight, reps),
});

function row(over: Partial<LiftProgressRow> = {}): LiftProgressRow {
  return {
    exerciseId: "bench-press",
    name: "Bench Press",
    sessions: 4,
    first: set(75, 6, "2026-08-28"),
    latest: set(82.5, 6, "2026-09-25"),
    series: [90, 92, 94, 99],
    direction: "up",
    newBest: null,
    holding: null,
    ...over,
  };
}

const renderCard = (rows: LiftProgressRow[]) =>
  render(
    <MemoryRouter>
      <LiftProgressCard rows={rows} subtitle="Last 30 days" />
    </MemoryRouter>
  );

describe("each lift's line", () => {
  it("shows the latest top set, and the first in the range it came from", () => {
    renderCard([row()]);
    expect(screen.getByText("82.5 kg × 6")).toBeInTheDocument();
    expect(screen.getByTestId("lift-status")).toHaveTextContent(
      /^Up from 75 kg × 6 on 28 Aug$/
    );
  });

  it("says down, and level, in the same plain terms", () => {
    renderCard([
      row({ name: "Deadlift", exerciseId: "deadlift", direction: "down" }),
      row({ name: "Barbell Squat", exerciseId: "squat", direction: "level" }),
    ]);
    const lines = screen
      .getAllByTestId("lift-status")
      .map((l) => l.textContent);
    expect(lines).toEqual([
      "Down from 75 kg × 6 on 28 Aug",
      "Level with 75 kg × 6 on 28 Aug",
    ]);
  });

  it("names a lift that has stopped moving, and for how long", () => {
    renderCard([
      row({
        direction: "level",
        holding: { best: set(105, 5, "2026-08-21"), sessionsSince: 4 },
      }),
    ]);
    expect(screen.getByTestId("lift-status")).toHaveTextContent(
      "No new best since 21 Aug · 4 sessions"
    );
  });

  it("puts gold on a new best and nowhere else", () => {
    renderCard([
      row({ newBest: set(82.5, 6, "2026-09-25") }),
      row({ name: "Deadlift", exerciseId: "deadlift" }),
    ]);
    expect(screen.getAllByText("New best")).toHaveLength(1);
    const [first] = screen.getAllByRole("listitem");
    expect(within(first).getByText("New best").className).toContain(
      "text-achievement-strong"
    );
  });

  it("draws a lift's line from four sessions, not fewer", () => {
    const { container } = renderCard([
      row(),
      row({
        name: "Deadlift",
        exerciseId: "deadlift",
        series: [150, 152, 155],
      }),
    ]);
    const items = container.querySelectorAll("li");
    expect(items[0].querySelector("polyline")).not.toBeNull();
    expect(items[1].querySelector("polyline")).toBeNull();
  });

  it("opens the lift's own history", () => {
    renderCard([row()]);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/history/exercise/Bench%20Press"
    );
  });
});

describe("how many it lists", () => {
  const seven = Array.from({ length: 7 }, (_, i) =>
    row({ name: `Lift ${i + 1}`, exerciseId: `lift-${i + 1}` })
  );

  it("shows five, then all of them on request", () => {
    renderCard(seven);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show all 7 lifts" }));
    expect(screen.getAllByRole("link")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("renders nothing without a session in the range", () => {
    const { container } = renderCard([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("says what it is waiting for before any lift's second session", () => {
    render(
      <MemoryRouter>
        <LiftProgressCard rows={[]} subtitle="Last 7 days" hasSessions />
      </MemoryRouter>
    );
    expect(screen.getByText("Repeat a lift to see progress")).toBeVisible();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FastestKilometresCard from "../FastestKilometresCard";
import type { BestEffortRow } from "@/lib/runInsights";

/**
 * Fastest kilometres (DS3): the quickest 1, 5 and 10 km in a row inside
 * the range's runs, beside the fastest ever. Gold is for a best set this
 * week only, and a distance is named as one ("5 km"), not as a race
 * ("5K") the runner may never have entered.
 */

const NEW_SINCE = "2026-09-21";

const renderCard = (rows: BestEffortRow[], unit: "km" | "mi" = "km") =>
  render(
    <MemoryRouter>
      <FastestKilometresCard
        rows={rows}
        unit={unit}
        subtitle="Last 30 days"
        newSinceKey={NEW_SINCE}
      />
    </MemoryRouter>
  );

const effort = (seconds: number, runId: string, date: string) => ({
  seconds,
  runId,
  date,
});

describe("FastestKilometresCard", () => {
  it("shows the range's fastest with its pace, against an older fastest ever", () => {
    renderCard([
      {
        km: 5,
        inRange: effort(1440, "r-recent", "2026-09-17"),
        allTime: effort(1351, "r-race", "2026-08-29"),
      },
    ]);
    const row = screen.getByRole("link");
    expect(within(row).getByText("5 km")).toBeInTheDocument();
    expect(within(row).getByText("24:00")).toBeInTheDocument();
    // 24:00 over 5 km is 4:48 a kilometre.
    expect(within(row).getByText("4:48")).toBeInTheDocument();
    expect(within(row).getByText("Fastest ever · 29 Aug")).toBeInTheDocument();
    expect(within(row).getByText("22:31")).toBeInTheDocument();
    expect(row).toHaveAttribute("href", "/run/r-recent");
    expect(screen.queryByText("New best")).toBeNull();
  });

  it("marks a fastest ever set this week in gold", () => {
    renderCard([
      {
        km: 1,
        inRange: effort(271, "r-new", "2026-09-24"),
        allTime: effort(271, "r-new", "2026-09-24"),
      },
    ]);
    expect(screen.getByText("New best").className).toContain(
      "text-achievement-strong"
    );
  });

  it("says a range best that is an older fastest ever in words, not gold", () => {
    renderCard([
      {
        km: 10,
        inRange: effort(2928, "r-race", "2026-08-29"),
        allTime: effort(2928, "r-race", "2026-08-29"),
      },
    ]);
    expect(screen.getByText("Your fastest ever")).toBeInTheDocument();
    expect(screen.queryByText("New best")).toBeNull();
  });

  it("keeps a distance with no effort in the range, pointing at the fastest ever", () => {
    renderCard([
      {
        km: 10,
        inRange: null,
        allTime: effort(2928, "r-race", "2026-08-29"),
      },
    ]);
    expect(screen.getByText("None in this range")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/run/r-race");
  });

  it("gives the pace per mile to a mile runner", () => {
    renderCard(
      [
        {
          km: 5,
          inRange: effort(1440, "r", "2026-09-17"),
          allTime: effort(1440, "r", "2026-09-17"),
        },
      ],
      "mi"
    );
    // 4:48 a kilometre is 7:43 a mile.
    expect(screen.getByRole("link")).toHaveTextContent(/7:43 \/mi/);
  });

  it("renders nothing without an effort", () => {
    const { container } = renderCard([]);
    expect(container).toBeEmptyDOMElement();
  });
});

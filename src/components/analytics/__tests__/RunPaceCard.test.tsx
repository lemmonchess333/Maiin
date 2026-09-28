import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RunPaceCard from "../RunPaceCard";
import type { PaceByKindRow } from "@/lib/runInsights";

/**
 * Pace by run type (DS3). Each kind apart, in the reader's unit, with the
 * change on the range before stated in seconds and never coloured as a
 * verdict: a faster easy run is not automatically good news.
 */

const ROWS: PaceByKindRow[] = [
  {
    kind: "easy",
    runs: 5,
    distanceM: 42_000,
    paceSecPerKm: 360,
    previousPaceSecPerKm: 368,
  },
  {
    kind: "long",
    runs: 4,
    distanceM: 58_300,
    paceSecPerKm: 365,
    previousPaceSecPerKm: 365,
  },
  {
    kind: "tempo",
    runs: 2,
    distanceM: 16_000,
    paceSecPerKm: 300,
    previousPaceSecPerKm: null,
  },
];

const renderCard = (unit: "km" | "mi" = "km", intervalsLeftOut = 0) =>
  render(
    <RunPaceCard
      rows={ROWS}
      intervalsLeftOut={intervalsLeftOut}
      unit={unit}
      subtitle="Last 30 days"
      comparedWith="the 30 days before"
    />
  );

describe("RunPaceCard", () => {
  it("lists each kind with its runs, distance and pace", () => {
    renderCard();
    expect(screen.getByText("Easy runs")).toBeInTheDocument();
    expect(screen.getByText("Long runs")).toBeInTheDocument();
    expect(screen.getByText("Tempo runs")).toBeInTheDocument();
    expect(screen.getByText("6:00")).toBeInTheDocument();
    expect(screen.getByText("42.0 km")).toBeInTheDocument();
  });

  it("counts one run as one run", () => {
    // A single race read "1 runs".
    render(
      <RunPaceCard
        rows={[
          ...ROWS,
          {
            kind: "race",
            runs: 1,
            distanceM: 5_000,
            paceSecPerKm: 290,
            previousPaceSecPerKm: null,
          },
        ]}
        intervalsLeftOut={0}
        unit="km"
        subtitle="Last 30 days"
        comparedWith="the 30 days before"
      />
    );
    const meta = (label: string) =>
      screen.getByText(label).closest("li")?.querySelector("p.text-xs")
        ?.textContent;
    expect(meta("Races")).toBe("1 run · 5.0 km");
    expect(meta("Easy runs")).toBe("5 runs · 42.0 km");
  });

  it("states a change in seconds, and none where there is nothing to compare", () => {
    renderCard();
    expect(screen.getByText("8 s/km faster")).toBeInTheDocument();
    expect(screen.getByText("Same pace")).toBeInTheDocument();
    // Tempo has no earlier runs to compare with: no change line at all.
    expect(screen.getAllByText(/faster|slower|Same pace/)).toHaveLength(2);
  });

  it("colours no change as a verdict", () => {
    renderCard();
    expect(screen.getByText("8 s/km faster").className).toContain(
      "text-muted-foreground"
    );
  });

  it("reads per mile for a mile runner, change included", () => {
    renderCard("mi");
    // 360 s/km is 9:39 per mile; 8 s/km is 13 s/mi.
    expect(screen.getByText("9:39")).toBeInTheDocument();
    expect(screen.getByText("13 s/mi faster")).toBeInTheDocument();
  });

  it("says why interval sessions are not listed, when there were some", () => {
    const { unmount } = renderCard("km", 2);
    expect(
      screen.getByText(
        /Interval sessions are left out: their average includes the recoveries\./
      )
    ).toBeInTheDocument();
    unmount();
    renderCard("km", 0);
    expect(screen.queryByText(/Interval sessions/)).toBeNull();
  });
});

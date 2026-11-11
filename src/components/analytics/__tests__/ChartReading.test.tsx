import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PeriodSummaryCard, { type SummaryFigure } from "../PeriodSummaryCard";
import TrainingWeeksCard from "../TrainingWeeksCard";
import { runningBins, runningFigures } from "@/lib/trainingWeeks";
import type { SummaryBin } from "@/lib/periodSummary";

/**
 * The reading line on the History cards that draw a range of weeks: the
 * chart's figure against the range before, in a sentence. On the
 * overview it stands where "Compared with the 30 days before" stood and
 * follows the figure the chart shows; for an account younger than the
 * range, the line it replaced stays and the reading says when it fills.
 */

const bin = (key: string, current = false): SummaryBin => ({
  key,
  lifts: 2,
  runs: 1,
  volumeKg: 8000,
  distanceM: 9000,
  current,
});
const BINS = [bin("2026-10-19"), bin("2026-10-26"), bin("2026-11-02", true)];

const FIGURES: SummaryFigure[] = [
  {
    metric: "sessions",
    value: "16",
    unit: "sessions",
    change: { direction: "up", text: "5" },
    reading: {
      text: "You trained 5 more sessions than the 30 days before.",
      waiting: false,
    },
  },
  {
    metric: "volume",
    value: "52.8k",
    unit: "kg lifted",
    change: { direction: "down", text: "3.5k kg" },
    reading: {
      text: "You lifted 3.5k kg less than the 30 days before.",
      waiting: false,
    },
  },
  { metric: "distance", value: "52.0", unit: "km run", change: null },
];

function summary(
  overrides: Partial<Parameters<typeof PeriodSummaryCard>[0]> = {}
) {
  return render(
    <PeriodSummaryCard
      title="Last 30 days"
      comparedWith="the 30 days before"
      figures={FIGURES}
      bins={BINS}
      granularity="weekly"
      plannedThisWeek={0}
      distanceUnit="km"
      {...overrides}
    />
  );
}

describe("the overview's period summary", () => {
  it("reads the chart's figure in a sentence where the compared-with line stood", () => {
    summary();
    expect(screen.getByTestId("chart-reading")).toHaveTextContent(
      "You trained 5 more sessions than the 30 days before."
    );
    expect(
      screen.queryByText("Compared with the 30 days before")
    ).not.toBeInTheDocument();
  });

  it("follows the figure the chart shows", () => {
    summary();
    fireEvent.click(screen.getByRole("radio", { name: /kg lifted/ }));
    expect(screen.getByTestId("chart-reading")).toHaveTextContent(
      "You lifted 3.5k kg less than the 30 days before."
    );
  });

  it("keeps the compared-with line for a figure with no reading", () => {
    summary();
    fireEvent.click(screen.getByRole("radio", { name: /km run/ }));
    expect(screen.queryByTestId("chart-reading")).not.toBeInTheDocument();
    expect(
      screen.getByText("Compared with the 30 days before")
    ).toBeInTheDocument();
  });

  it("tells an account younger than the range when it compares, under its join day", () => {
    const waiting = {
      text: "From 3 Dec, this compares with the 30 days before.",
      waiting: true,
    };
    summary({
      comparedWith: null,
      sinceLabel: "Since you joined on 3 Nov",
      figures: FIGURES.map((f) => ({ ...f, change: null, reading: waiting })),
    });
    expect(screen.getByText("Since you joined on 3 Nov")).toBeInTheDocument();
    const line = screen.getByTestId("chart-reading");
    expect(line).toHaveTextContent(waiting.text);
    expect(line.className).toContain("text-muted-foreground");
  });
});

describe("a sport's weeks", () => {
  it("reads the range against the range before under its title", () => {
    render(
      <TrainingWeeksCard
        title="Distance"
        subtitle="Last 30 days"
        figures={runningFigures({
          distanceM: 52_000,
          runs: 3,
          seconds: 18_000,
          unit: "km",
        })}
        bins={BINS}
        granularity="weekly"
        sport="running"
        reading={runningBins("km")}
        average={9}
        averageText="9.0 km"
        verdict={{
          text: "You ran 41.0 km more than the 30 days before.",
          waiting: false,
        }}
      />
    );
    const line = screen.getByTestId("chart-reading");
    expect(line).toHaveTextContent(
      "You ran 41.0 km more than the 30 days before."
    );
    // In the card's own colour: the words carry the verdict.
    expect(line.className).toContain("text-foreground");
    expect(line.className).not.toMatch(/success|warning|destructive/);
  });
});

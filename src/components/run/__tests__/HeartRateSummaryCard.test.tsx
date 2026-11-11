import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import HeartRateSummaryCard from "../HeartRateSummaryCard";
import type { HeartRateSummary } from "@/lib/hrZones";

afterEach(() => cleanup());

const complete: HeartRateSummary = {
  averageBpm: 145,
  maxBpm: 174,
  coveredSeconds: 240,
  movingSeconds: 300,
  coverage: 0.8,
  zoneSeconds: [0, 80, 120, 40, 0],
  belowZoneSeconds: 0,
  maxHr: 200,
  source: "apple-watch",
};

describe("saved heart rate summary", () => {
  it("shows actual zone durations when the Watch covered at least half the run", () => {
    render(<HeartRateSummaryCard summary={complete} />);
    expect(screen.getByText("145")).toBeVisible();
    expect(screen.getByText("174")).toBeVisible();
    expect(screen.getByText(/Watch covered 80%/)).toBeVisible();
    expect(screen.getByText("Z3 · Steady")).toBeVisible();
    expect(screen.getByText("2:00")).toBeVisible();
  });

  it("explains partial coverage without showing a time-in-zone breakdown", () => {
    render(
      <HeartRateSummaryCard
        summary={{ ...complete, coveredSeconds: 60, coverage: 0.2 }}
      />
    );
    expect(screen.getByText(/captured for 20% of moving time/)).toBeVisible();
    expect(screen.queryByText("Z3 · Steady")).not.toBeInTheDocument();
  });

  it("shows bpm but asks for max HR before interpreting zones", () => {
    render(
      <HeartRateSummaryCard
        summary={{ ...complete, maxHr: 0, zoneSeconds: [0, 0, 0, 0, 0] }}
      />
    );
    expect(screen.getByText("145")).toBeVisible();
    expect(screen.getByText(/Set a maximum heart rate/)).toBeVisible();
    expect(screen.queryByText("Z3 · Steady")).not.toBeInTheDocument();
  });

  it("does not show malformed or absent saved health data", () => {
    const { container } = render(<HeartRateSummaryCard summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

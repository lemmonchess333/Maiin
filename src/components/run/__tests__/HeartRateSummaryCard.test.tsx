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
    // Rule 5: the card says the reading was partial.
    expect(
      screen.getByText(/Partial reading: heart rate covered 20% of moving time/)
    ).toBeVisible();
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

  it("names a Bluetooth sensor as the source when one read the run", () => {
    render(
      <HeartRateSummaryCard summary={{ ...complete, source: "bluetooth" }} />
    );
    expect(screen.getByText(/Sensor covered 80%/)).toBeVisible();
    expect(screen.getByText("Z3 · Steady")).toBeVisible();
  });

  it("hides time in zone just under half the run, and shows it at half", () => {
    const { unmount } = render(
      <HeartRateSummaryCard summary={{ ...complete, coverage: 0.49 }} />
    );
    expect(screen.getByText(/Partial reading/)).toBeVisible();
    expect(screen.queryByText("Z3 · Steady")).not.toBeInTheDocument();
    unmount();
    render(<HeartRateSummaryCard summary={{ ...complete, coverage: 0.5 }} />);
    expect(screen.getByText("Z3 · Steady")).toBeVisible();
  });

  it("does not show a summary from a source it does not know", () => {
    const { container } = render(
      <HeartRateSummaryCard summary={{ ...complete, source: "phone" }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not show malformed or absent saved health data", () => {
    const { container } = render(<HeartRateSummaryCard summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows steady heart rate drift when decoupling is under 5%", () => {
    render(
      <HeartRateSummaryCard
        summary={{
          ...complete,
          decoupling: {
            pct: 2.4,
            firstHalfAvgBpm: 144,
            secondHalfAvgBpm: 147,
            status: "steady",
          },
        }}
      />
    );
    expect(screen.getByText("Heart rate drift")).toBeVisible();
    expect(screen.getByText("2.4%")).toBeVisible();
    expect(
      screen.getByText(/Held steady across both halves \(144 to 147 bpm\)/)
    ).toBeVisible();
  });

  it("shows mild and high drift notes cleanly and ignores malformed decoupling", () => {
    const { unmount } = render(
      <HeartRateSummaryCard
        summary={{
          ...complete,
          decoupling: {
            pct: 12.1,
            firstHalfAvgBpm: 142,
            secondHalfAvgBpm: 161,
            status: "high_drift",
          },
        }}
      />
    );
    expect(screen.getByText("12.1%")).toBeVisible();
    expect(
      screen.getByText(/Noticeable second-half drift \(142 to 161 bpm\)/)
    ).toBeVisible();
    unmount();

    render(
      <HeartRateSummaryCard
        summary={{
          ...complete,
          decoupling: { pct: NaN, status: "unknown" },
        }}
      />
    );
    expect(screen.getByText("145")).toBeVisible();
    expect(screen.queryByText("Heart rate drift")).not.toBeInTheDocument();
  });

  /* A tempo saved with "high_drift" before 28 November 2026: its second
     half was meant to be harder, so the drift is not shown. */
  it("shows no drift saved on a run that was not steady", () => {
    const tempo = {
      ...complete,
      decoupling: {
        pct: 16.4,
        firstHalfAvgBpm: 153,
        secondHalfAvgBpm: 168,
        status: "high_drift" as const,
      },
    };
    render(<HeartRateSummaryCard summary={tempo} steady={false} />);
    expect(screen.getByText("145")).toBeVisible();
    expect(screen.queryByText(/drift/i)).not.toBeInTheDocument();
    expect(screen.queryByText("16.4%")).not.toBeInTheDocument();
    cleanup();
    render(<HeartRateSummaryCard summary={tempo} />);
    expect(screen.getByText(/Noticeable second-half drift/)).toBeVisible();
  });
});

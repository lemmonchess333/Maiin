/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

vi.mock("@/lib/homeAnalytics", function () {
  return { track: vi.fn() };
});

import WeightStepsTiles from "../WeightStepsTiles";

describe("WeightStepsTiles", function () {
  it("shows the raw weight number when hideNumber is off (default)", function () {
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
      />
    );
    expect(screen.getByText("75.4")).toBeInTheDocument();
    // aria-label announces the figure
    const tile = screen.getByRole("button", { name: /Weight 75\.4 kg/i });
    expect(tile).toBeInTheDocument();
  });

  it("#984: with hideNumber + a weight, the raw figure is NOT rendered but a trend/direction indicator IS", function () {
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        hideNumber
        weightTrend="down"
      />
    );

    // Raw number must be gone from the DOM entirely.
    expect(screen.queryByText("75.4")).not.toBeInTheDocument();
    // No unit suffix either.
    expect(screen.queryByText("kg")).not.toBeInTheDocument();

    // Direction/trend phrase is shown instead.
    expect(screen.getByText("Trending down")).toBeInTheDocument();

    // aria-label does NOT announce the raw figure.
    const tile = screen.getByRole("button", {
      name: /Weight trending down, last logged Logged today/i,
    });
    expect(tile).toBeInTheDocument();
    expect(tile.getAttribute("aria-label") || "").not.toContain("75.4");
  });

  it("#984: trend phrases map to direction", function () {
    const cases: Array<[any, string]> = [
      ["up", "Trending up"],
      ["flat", "Steady"],
      [null, "Tracking"],
    ];
    for (const [trend, phrase] of cases) {
      const { unmount } = render(
        <WeightStepsTiles
          lastWeight="80.0"
          weightUnit="kg"
          onLogWeight={vi.fn()}
          lastWeightDate="2 days ago"
          hideNumber
          weightTrend={trend}
        />
      );
      expect(screen.getByText(phrase)).toBeInTheDocument();
      expect(screen.queryByText("80.0")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("#984: hideNumber has no effect on the empty state (no weight logged)", function () {
    render(
      <WeightStepsTiles
        lastWeight={null}
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Tap to log"
        hideNumber
        weightTrend="down"
      />
    );
    // Empty state em-dash and empty-state aria-label preserved.
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Weight not yet logged/i })
    ).toBeInTheDocument();
  });
});

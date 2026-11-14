/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

vi.mock("@/lib/homeAnalytics", function () {
  return { track: vi.fn() };
});

import WeightTile from "../WeightTile";

describe("WeightTile", function () {
  it("heads the tile, outside its button, so Home steps through it by heading", function () {
    render(
      <WeightTile
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
      />
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Weight" });
    // A heading inside a button is read as the button's name, not as a
    // heading, so it has to sit beside the tile's control.
    expect(heading.closest("button")).toBeNull();
  });

  it("carries no steps: they left Home for Food's activity level offer (Q31)", function () {
    render(
      <WeightTile
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
      />
    );
    // Positive anchor first: the tile drew.
    expect(
      screen.getByRole("button", { name: /Weight 75\.4 kg/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/steps/i)).toBeNull();
    expect(screen.queryByText("Connect Health")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows the raw weight number when hideNumber is off (default)", function () {
    render(
      <WeightTile
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
      <WeightTile
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
        <WeightTile
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

  afterEach(function () {
    vi.clearAllMocks();
  });

  it("#984: hideNumber has no effect on the empty state (no weight logged)", function () {
    render(
      <WeightTile
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

  it("loading with no weight yet: a skeleton, not the empty state", function () {
    render(
      <WeightTile
        lastWeight={null}
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Tap to log"
        loading
      />
    );
    expect(screen.getAllByRole("status", { name: /loading/i }).length).toBe(2);
    expect(screen.queryByText("\u2014")).toBeNull();
    expect(screen.queryByText("Tap to log")).toBeNull();
    expect(
      screen.getByRole("button", { name: /weight loading/i })
    ).toBeInTheDocument();
  });

  it("loading with a weight already known: the number wins over the skeleton", function () {
    render(
      <WeightTile
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        loading
      />
    );
    expect(screen.getByText("75.4")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading/i })).toBeNull();
  });

  it("loaded with no weight: the empty state, with its log-prompting label", function () {
    render(
      <WeightTile
        lastWeight={null}
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Tap to log"
      />
    );
    expect(screen.getByText("\u2014")).toBeInTheDocument();
    expect(screen.getByText("Tap to log")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /not yet logged/i })
    ).toBeInTheDocument();
  });
});

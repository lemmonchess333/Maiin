/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

vi.mock("@/lib/homeAnalytics", function () {
  return { track: vi.fn() };
});

// Steps tile is native-only now; default the platform guard to web (false)
// and flip it true per-test for the native rendering paths.
vi.mock("@/lib/platform", function () {
  return {
    isNativePlatform: vi.fn(function () {
      return false;
    }),
  };
});

import WeightStepsTiles from "../WeightStepsTiles";
import * as tiles from "../WeightStepsTiles";
import { isNativePlatform } from "@/lib/platform";

const setNative = (v: boolean) =>
  (isNativePlatform as unknown as ReturnType<typeof vi.fn>).mockReturnValue(v);

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

  afterEach(function () {
    // Gate ships enabled; keep it at its default between tests.
    tiles.stepsTileGate.enabled = true;
    vi.clearAllMocks();
    setNative(false);
  });

  it("web (non-native): Steps tile hidden even with data", function () {
    setNative(false);
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        stepsStatus="connected"
        steps={842}
      />
    );
    // No steps affordance anywhere on web.
    expect(
      screen.queryByRole("button", { name: /steps today/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Connect Health")).not.toBeInTheDocument();
    // home-declutter: the duo stacks vertically in the right column, so
    // the wrapper is grid-cols-1 in every state — tile presence, not
    // column count, is the contract now.
    expect(screen.queryByText("Steps")).not.toBeInTheDocument();
  });

  it("native + unavailable: Steps tile hidden", function () {
    setNative(true);
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        stepsStatus="unavailable"
      />
    );
    expect(screen.queryByText("Connect Health")).not.toBeInTheDocument();
    expect(screen.queryByText("Steps")).not.toBeInTheDocument();
  });

  it("native + unprompted: Connect Health affordance, tap connects", function () {
    setNative(true);
    const onConnectSteps = vi.fn();
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        stepsStatus="unprompted"
        onConnectSteps={onConnectSteps}
      />
    );
    const tile = screen.getByRole("button", {
      name: /Steps not yet connected/i,
    });
    expect(tile).toBeInTheDocument();
    expect(screen.getByText("Connect Health")).toBeInTheDocument();
    tile.click();
    expect(onConnectSteps).toHaveBeenCalledTimes(1);
  });

  it("native + connected: renders today's step count (no Connect), tap does NOT connect", function () {
    setNative(true);
    const onConnectSteps = vi.fn();
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        stepsStatus="connected"
        steps={842}
        onConnectSteps={onConnectSteps}
      />
    );
    expect(screen.getByText("842")).toBeInTheDocument();
    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.queryByText("Connect Health")).not.toBeInTheDocument();
    const tile = screen.getByRole("button", { name: /842 steps today/i });
    tile.click();
    expect(onConnectSteps).not.toHaveBeenCalled();
  });

  it("native + ambiguous (connected, zero data): renders 0, no error state", function () {
    setNative(true);
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        stepsStatus="ambiguous"
        steps={0}
      />
    );
    expect(
      screen.getByRole("button", { name: /0 steps today/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Connect Health")).not.toBeInTheDocument();
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

  it("native with no steps wiring: no placeholder, Weight still renders", function () {
    // The pre-HealthKit placeholder ("Connect Health" with a dead CTA on a
    // caller that wired nothing) is gone by design: stepsStatus defaults to
    // "unavailable", so an unwired caller never ships a dead affordance —
    // the tile appears only once useSteps reports Health as present.
    vi.mocked(isNativePlatform).mockReturnValue(true);
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
      />
    );
    expect(screen.queryByText("Connect Health")).not.toBeInTheDocument();
    expect(screen.queryByText("Steps")).not.toBeInTheDocument();
    // Weight is still present.
    expect(
      screen.getByRole("button", { name: /Weight 75\.4 kg/i })
    ).toBeInTheDocument();
  });
});

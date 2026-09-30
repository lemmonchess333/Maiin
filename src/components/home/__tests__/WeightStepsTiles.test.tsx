/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

vi.mock("@/lib/homeAnalytics", function () {
  return { track: vi.fn() };
});

// The Steps tile is a control only on the phone; the web shows it as a
// picture. Default the platform guard to web (false) and flip it true
// per-test for the native paths.
vi.mock("@/lib/platform", function () {
  return {
    isNativePlatform: vi.fn(function () {
      return false;
    }),
  };
});

import WeightStepsTiles from "../WeightStepsTiles";
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
    vi.clearAllMocks();
    setNative(false);
  });

  it("web: shows the iPhone's Connect Health tile as a picture, not a control", function () {
    // Owner call 2026-09-30 (ADR-0007 Q5): a browser can't read Apple
    // Health, but the web preview shows the tile in the state a new
    // iPhone user sees. Home on the web passes status "unavailable".
    setNative(false);
    const onConnectSteps = vi.fn();
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
        stepsStatus="unavailable"
        onConnectSteps={onConnectSteps}
      />
    );
    expect(screen.getByText("Steps")).toBeInTheDocument();
    expect(screen.getByText("Connect Health")).toBeInTheDocument();
    // Nothing to connect on the web, so the only control is Weight's.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /steps/i })
    ).not.toBeInTheDocument();
    // A screen reader hears where connecting happens.
    expect(
      screen.getByText(/in the Tropos iPhone app/i).parentElement
    ).toHaveTextContent("Connect Health in the Tropos iPhone app");
    fireEvent.click(screen.getByText("Connect Health"));
    expect(onConnectSteps).not.toHaveBeenCalled();
  });

  it("web: the tile shows with no steps wiring at all", function () {
    setNative(false);
    render(
      <WeightStepsTiles
        lastWeight="75.4"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="Logged today"
      />
    );
    expect(screen.getByText("Connect Health")).toBeInTheDocument();
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
    // The web's screen-reader note is not on the phone, where the tile
    // connects right here.
    expect(screen.queryByText(/in the Tropos iPhone app/i)).toBeNull();
    tile.click();
    expect(onConnectSteps).toHaveBeenCalledTimes(1);
  });

  it("native + connected: renders today's step count (no Connect), tap does NOT connect", function () {
    setNative(true);
    const onConnectSteps = vi.fn();
    const { container } = render(
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
    // Steps are a reading like weight, so the footprints take the scale's
    // colour; green means a good result (DS3, one colour per job).
    const footprints =
      container.querySelector<SVGElement>(".lucide-footprints");
    const scale = container.querySelector<SVGElement>(".lucide-scale");
    expect(footprints?.style.color).toBeTruthy();
    expect(footprints?.style.color).toBe(scale?.style.color);
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
    // On the phone the Connect tile is a real control, so it must never
    // show where nothing can connect: stepsStatus defaults to
    // "unavailable", and the tile appears only once useSteps reports
    // Health as present. (The web's picture of it is the other case.)
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
  it("loading with no weight yet: a skeleton, not the empty state", function () {
    render(
      <WeightStepsTiles
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
      <WeightStepsTiles
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
      <WeightStepsTiles
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

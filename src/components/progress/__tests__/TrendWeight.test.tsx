/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Recharts' ResponsiveContainer renders nothing at 0x0 in jsdom, and the
// SVG primitives don't surface their text labels usefully. Mock the chart
// to passthrough children so we can assert the surrounding copy (header,
// projection) — that's where every raw-figure decision lives.
vi.mock("recharts", function () {
  const Pass = function ({ children }: any) {
    return <div>{children}</div>;
  };
  const Noop = function () {
    return null;
  };
  return {
    ResponsiveContainer: Pass,
    ComposedChart: Pass,
    Line: Noop,
    Scatter: Noop,
    XAxis: Noop,
    YAxis: Noop,
    ReferenceLine: Noop,
    Tooltip: Noop,
  };
});

const profileRef: { current: any } = { current: null };
vi.mock("@/lib/auth", function () {
  return {
    useAuth: function () {
      return { user: { uid: "u1" }, profile: profileRef.current };
    },
    useUid: function () {
      return "u1";
    },
  };
});

const logsRef: { current: { date: string; weight: number }[] } = {
  current: [],
};
vi.mock("@/lib/api", function () {
  return {
    fetchBodyweightLogs: function () {
      return Promise.resolve(logsRef.current);
    },
  };
});

import { TrendWeight } from "../TrendWeight";

// A descending series spanning >30 days, ending today, with enough
// points to clear the T3 projection gate (≥5 points, ≥30-day window).
function descendingSeries(): { date: string; weight: number }[] {
  const out: { date: string; weight: number }[] = [];
  const points = 12;
  for (let i = 0; i < points; i++) {
    const daysAgo = (points - 1 - i) * 4; // 0..44 days ago
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    out.push({
      date: d.toISOString().slice(0, 10),
      weight: 85 - i * 0.4,
    });
  }
  return out;
}

describe("TrendWeight — #984 hide the number", function () {
  beforeEach(function () {
    logsRef.current = descendingSeries();
  });

  it("shows the raw trend figure when hideWeightNumber is off", async function () {
    profileRef.current = {
      preferredWeightUnit: "kg",
      hideWeightNumber: false,
      // The user's own goal (Settings → Nutrition), not one derived
      // from the programme.
      goalWeightKg: 75,
      weeklyRateKg: -0.5,
      program: { goal: "cut" },
    };
    render(<TrendWeight />);
    await waitFor(function () {
      expect(screen.getByText(/Trending at/i)).toBeInTheDocument();
    });
    // A kg figure is rendered in the header (the non-hidden path).
    expect(screen.getAllByText(/kg/).length).toBeGreaterThan(0);
  });

  it("with hideWeightNumber on: no raw weight figure, qualitative direction shown, projection date still rendered", async function () {
    profileRef.current = {
      preferredWeightUnit: "kg",
      hideWeightNumber: true,
      // The user's own goal (Settings → Nutrition), not one derived
      // from the programme.
      goalWeightKg: 75,
      weeklyRateKg: -0.5,
      program: { goal: "cut" },
    };
    const { container } = render(<TrendWeight />);

    await waitFor(function () {
      // Qualitative headline (toward goal, since cut + descending).
      expect(
        screen.getByText(/Trending toward your goal|Holding steady/i)
      ).toBeInTheDocument();
    });

    // No "Trending at <n> kg" header readout.
    expect(screen.queryByText(/Trending at/i)).not.toBeInTheDocument();
    // No "kg"/"lbs" unit text anywhere (header / axis / tooltip figures gone).
    expect(container.textContent || "").not.toMatch(/\bkg\b|\blbs\b/);

    // Projection date framing is preserved (date is motivational, not a
    // body-weight figure) — "At this rate, goal by ...".
    expect(screen.getByText(/At this rate, goal by/i)).toBeInTheDocument();
  });
});

describe("TrendWeight — the goal is the user's own", function () {
  beforeEach(function () {
    logsRef.current = descendingSeries();
  });

  it("draws the goal the user set, not the programme's start weight less 5 kg", async function () {
    profileRef.current = {
      preferredWeightUnit: "kg",
      hideWeightNumber: false,
      goalWeightKg: 78,
      weeklyRateKg: -0.5,
      // The old derivation would have invented 85 - 5 = 80.
      program: { goal: "cut", startWeight: 85 },
    };
    render(<TrendWeight />);
    await waitFor(function () {
      expect(screen.getByText(/Trending at/i)).toBeInTheDocument();
    });
    // The header's distance to goal is measured from the user's 78.
    // (The chart's own "Goal:" label is SVG that jsdom does not lay out.)
    const header = screen.getByText(/Trending at/i).textContent ?? "";
    const trend = Number(/Trending at\s*([\d.]+)/.exec(header)?.[1]);
    const toGoal = Number(/([\d.]+)\s*kg to goal/.exec(header)?.[1]);
    expect(Number.isFinite(trend)).toBe(true);
    expect(toGoal).toBeCloseTo(Math.abs(trend - 78), 1);
    expect(toGoal).not.toBeCloseTo(Math.abs(trend - 80), 1);
  });

  it("draws no goal for a maintainer", async function () {
    profileRef.current = {
      preferredWeightUnit: "kg",
      hideWeightNumber: false,
      // Onboarding's default: the signup weight at a rate of 0.
      goalWeightKg: 85,
      weeklyRateKg: 0,
      program: { goal: "recomp", startWeight: 85 },
    };
    render(<TrendWeight />);
    await waitFor(function () {
      expect(screen.getByText(/Trending at/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/to goal/)).toBeNull();
    expect(screen.queryByText(/Goal:/)).toBeNull();
    expect(screen.queryByText(/At this rate, goal by/i)).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * The running summary counts its own runs correctly.
 *
 * The tile read "1 total runs" for anyone with a single run in the window —
 * which is every runner in their first week, and every runner whose selected
 * range happens to hold one.
 *
 * It was worth checking rather than assuming, because this repo has a
 * documented case that LOOKS identical and is not a bug: ShareCardRenderer's
 * stat labels are invariant uppercase by design, so "1 EXERCISES" is correct
 * there. The distinction is that those are uppercase labels, while this is
 * lowercase prose sitting directly under its number.
 *
 * The app's convention is not ambiguous once counted: 73 sites pluralise a
 * lowercase count noun, six of them for run/runs specifically — including
 * History's own LIFETIME tile, which renders "1 run" on the same page and a
 * few hundred pixels further down.
 *
 * Its two neighbours in the same three-tile row stay invariant, and should:
 * "total km" is a unit and "best pace" is a phrase. Neither is a count.
 */

const mockUseRunningStats = vi.fn();
vi.mock("../../../hooks/useRunningStats", () => ({
  useRunningStats: () => mockUseRunningStats(),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

import RunningHistorySection from "../RunningHistorySection";

/** A saved run in the shape the volume/pace filters accept. */
function run(distanceMetres: number, avgPace = 300) {
  return {
    id: `r-${distanceMetres}-${Math.random()}`,
    distance: distanceMetres,
    avgPace,
    duration: 1800,
    activityType: "outdoor",
    completedAt: new Date("2026-09-10T08:00:00Z"),
  };
}

function setup(runs: ReturnType<typeof run>[]) {
  mockUseRunningStats.mockReturnValue({
    runs,
    binnedData: [{ week: "2026-09-07", totalDistance: 5.2 }],
    granularity: "weekly",
    loading: false,
  });
  return render(<RunningHistorySection rangeDays={30} />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("running summary — the run count reads as English", () => {
  it("one run is a run", () => {
    setup([run(5200)]);
    expect(screen.getByText(/^total run$/)).toBeInTheDocument();
    expect(screen.queryByText(/^total runs$/)).toBeNull();
  });

  it("more than one is runs", () => {
    setup([run(5200), run(7300)]);
    expect(screen.getByText(/^total runs$/)).toBeInTheDocument();
  });

  it("zero is runs, not run", () => {
    /* Reachable, and not by an empty list: the row renders whenever any run
       exists, but the count is the VOLUME-ELIGIBLE subset. A legacy 0 km
       zombie — the case the component's own comment describes — renders the
       row with a count of zero.

       Asserted unconditionally on purpose. An earlier draft wrapped this in
       `if (label)`, which passes when the label is absent and so survived the
       `count > 1` mutation that gets exactly this branch wrong. */
    setup([run(0, 0)]);
    expect(screen.getByText(/^total runs$/)).toBeInTheDocument();
    expect(screen.queryByText(/^total run$/)).toBeNull();
  });

  it("the neighbouring labels stay invariant — they are not counts", () => {
    setup([run(5200)]);
    expect(screen.getByText(/^total km$/)).toBeInTheDocument();
    expect(screen.getByText("best pace")).toBeInTheDocument();
  });
});

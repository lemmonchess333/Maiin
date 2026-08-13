/**
 * A7 — RaceDayPlanCard render contract: the phase gate and the no-data
 * gate both null the card; a taper-week render carries the tiers, the
 * split table, and the honest note. All pacing logic is pinned in
 * `raceDayPlan.test.ts` — this only covers the component seam.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RaceDayPlanCard from "../RaceDayPlanCard";

/* These components read the display unit, which resolves from the auth
   profile — and `useAuth` throws outside an AuthProvider, which none of
   these render inside. Mocking the one-export hook rather than `@/lib/auth`
   keeps the blast radius at one symbol: a bare factory mock of `auth` would
   leave its other exports undefined and fail at some unrelated call site.
   Metric is the app default, so the existing assertions are unaffected. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));


const fitness = { benchmark: { distanceM: 5000, timeS: 1200 }, vdot: null };

describe("RaceDayPlanCard", () => {
  it("renders goals + splits in taper week", () => {
    render(
      <RaceDayPlanCard
        distance="half"
        targetTimeS={5400}
        runFitness={fitness}
        currentWeek={7}
        totalWeeks={10}
      />
    );
    expect(screen.getByText("Race-day plan")).toBeInTheDocument();
    // Header meta AND the A-goal both show the plan time.
    expect(screen.getAllByText("1:30:00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Your goal")).toBeInTheDocument();
    expect(screen.getByText("The goal that always counts")).toBeInTheDocument();
    expect(screen.getByText("20 km")).toBeInTheDocument();
    expect(screen.getByText(/negative split/i)).toBeInTheDocument();
    // A8: a 90-min half plan clears the fueling threshold — the consensus
    // carbs-per-hour line renders.
    expect(screen.getByText(/carbs per hour/i)).toBeInTheDocument();
  });

  it("nulls outside taper/race and without any time to pace from", () => {
    const build = render(
      <RaceDayPlanCard
        distance="half"
        targetTimeS={5400}
        runFitness={fitness}
        currentWeek={4}
        totalWeeks={10}
      />
    );
    expect(build.container).toBeEmptyDOMElement();

    const noData = render(
      <RaceDayPlanCard
        distance="half"
        targetTimeS={null}
        runFitness={null}
        currentWeek={7}
        totalWeeks={10}
      />
    );
    expect(noData.container).toBeEmptyDOMElement();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import WeightRateCard from "../WeightRateCard";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

/**
 * The Body page's rate (DS3): kilograms a week now, against the user's
 * own target, and the weekly averages behind it. Every figure here is a
 * weight, so "Hide the number" hides the card.
 */

const TODAY = new Date(2026, 8, 30); // a Wednesday
const day = (n: number) => localDateString(addLocalDays(TODAY, -n));

/** A daily weigh-in for `days` days, the trend falling `perDay` a day. */
function history(days: number, start: number, perDay: number) {
  return Array.from({ length: days }, (_, i) => {
    const trend = start + i * perDay;
    return { date: day(days - 1 - i), actual: trend, trend };
  });
}

const renderCard = (over: Partial<Parameters<typeof WeightRateCard>[0]> = {}) =>
  render(
    <WeightRateCard
      points={history(60, 86, -0.05)}
      unit="kg"
      targetKgPerWeek={-0.4}
      hideNumber={false}
      today={TODAY}
      {...over}
    />
  );

describe("the rate", () => {
  it("states the last four weeks' rate beside the user's target", () => {
    renderCard();
    expect(screen.getByText("−0.35")).toBeInTheDocument();
    expect(screen.getByText("kg a week, last 4 weeks")).toBeInTheDocument();
    expect(screen.getByText("−0.40")).toBeInTheDocument();
    expect(screen.getByText("kg a week, your target")).toBeInTheDocument();
  });

  it("says how the two compare, in plain words", () => {
    const cases: [number, number | null, string | null][] = [
      [-0.03, -0.4, "Slower than your target."],
      [-0.06, -0.3, "Faster than your target."],
      [-0.055, -0.4, "On your target."],
      [0.03, -0.4, "Moving the other way from your target."],
      [0.001, -0.4, "Holding steady for now."],
      [-0.05, null, null],
    ];
    for (const [perDay, target, verdict] of cases) {
      const { unmount } = renderCard({
        points: history(60, 86, perDay),
        targetKgPerWeek: target,
      });
      if (verdict) expect(screen.getByText(verdict)).toBeInTheDocument();
      else
        expect(
          screen.queryByText(/target\.|steady for now\./)
        ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("shows no target to a user without one", () => {
    renderCard({ targetKgPerWeek: null });
    expect(screen.queryByText(/your target/)).toBeNull();
  });

  it("gives pounds to a pound user", () => {
    renderCard({ unit: "lbs" });
    // −0.35 kg a week is −0.77 lb.
    expect(screen.getByText("−0.77")).toBeInTheDocument();
    expect(screen.getByText("lbs a week, last 4 weeks")).toBeInTheDocument();
  });

  it("has no rate before a month of weigh-ins, but keeps the averages", () => {
    renderCard({ points: history(12, 86, -0.05) });
    expect(screen.queryByText(/a week, last/)).toBeNull();
    expect(screen.getByText("Weekly averages")).toBeInTheDocument();
  });
});

describe("weekly averages", () => {
  it("lists weeks newest first, this one marked as still going", () => {
    renderCard({ points: history(60, 86, -0.06) });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("This week so far")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^Week of /)).toBeInTheDocument();
    // A daily weigher: seven weigh-ins in a whole week.
    expect(within(rows[1]).getByText("7")).toBeInTheDocument();
    // Falling 0.42 kg a week, week on week.
    expect(within(rows[1]).getByTestId("week-change")).toHaveTextContent(
      "−0.4"
    );
  });
});

describe("hide the number", () => {
  it("renders nothing, since every figure here is a weight", () => {
    const { container } = renderCard({ hideNumber: true });
    expect(container).toBeEmptyDOMElement();
  });
});

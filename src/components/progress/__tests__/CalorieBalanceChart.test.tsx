import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { format, subDays } from "date-fns";
import type { Meal } from "@/hooks/useMeals";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { program: { goal: "recomp" } } }),
}));
vi.mock("recharts", () => {
  const Pass = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Noop = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
      <div>
        <output data-testid="chart-data">{JSON.stringify(data)}</output>
        {children}
      </div>
    ),
    Bar: Pass,
    Cell: Noop,
    XAxis: Noop,
    YAxis: Noop,
    ReferenceLine: Noop,
    Tooltip: Noop,
  };
});
import CalorieBalanceChart from "../CalorieBalanceChart";
import { SEP_RE } from "@/test/localeGrouping";
afterEach(cleanup);
const meal = (daysAgo: number, calories: number) =>
  ({
    date: format(subDays(new Date(), daysAgo), "yyyy-MM-dd"),
    totalCalories: calories,
  }) as Meal;
const points = () =>
  JSON.parse(screen.getByTestId("chart-data").textContent!) as {
    balance: number | null;
  }[];

describe("nutrition evidence limits", () => {
  it("does not chart unlogged days as zero-intake deficits", () => {
    render(<CalorieBalanceChart meals={[]} />);
    expect(points().every((point) => point.balance === null)).toBe(true);
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
  });
  it("does not forecast weight loss from today's single banana", () => {
    render(<CalorieBalanceChart meals={[meal(0, 210)]} />);
    expect(points().every((point) => point.balance === null)).toBe(true);
    expect(screen.getByText("0 / 13")).toBeInTheDocument();
    expect(
      screen.queryByText(/At this rate|Holding —|On track —/)
    ).not.toBeInTheDocument();
  });
  /* The card's closing paragraph carried two different kinds of sentence.
     "Estimated maintenance − logged food" and "a gap is a day with no
     food logged" are a legend, and legends now live behind the ⓘ the
     Performance Index established. "This chart does not predict weight
     change" is not a legend — it is what stops a reader taking a run of
     green bars for weight lost, and a caveat behind a tap is concealment
     dressed as tidying. So only the legend half moved. */
  it("puts the legend behind the ⓘ rather than on the card", () => {
    render(<CalorieBalanceChart meals={[]} />);
    expect(screen.queryByText(/Estimated maintenance/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "How calorie balance is measured" })
    );
    expect(screen.getByText(/Estimated maintenance/)).toBeInTheDocument();
    expect(screen.getByText(/day with no food logged/)).toBeInTheDocument();
  });

  it("keeps the weight-change caveat visible without a tap", () => {
    render(<CalorieBalanceChart meals={[]} />);
    expect(
      screen.getByText(/does not predict weight change/)
    ).toBeInTheDocument();
  });

  it("counts only past days with entries and discloses incomplete logs", () => {
    render(<CalorieBalanceChart meals={[meal(1, 210), meal(0, 100)]} />);
    expect(points().filter((point) => point.balance !== null)).toHaveLength(1);
    expect(screen.getByText("1 / 13")).toBeInTheDocument();
    expect(
      screen.getByText(/Partial logs can overstate a deficit/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/kg\/week/)).not.toBeInTheDocument();
  });
});

/**
 * The footer's two numbers, which are the ones a reader compares against
 * the rest of the page.
 *
 * The average gap printed raw — "+1888 kcal" — while the tooltip thirty
 * lines above it in the same component, and every calorie figure in the
 * Nutrition section beside it ("target 2,200 kcal"), group their
 * thousands. One page, one unit, two conventions.
 *
 * The denominator was the literal 13 sitting beside a literal 14-day
 * window and a literal "14 days" label: one number decided in one place
 * and written out in three others. It is now derived, and asserted
 * against the chart's own point count rather than against another
 * literal — the two cannot drift apart without this failing.
 */
describe("calorie balance footer", () => {
  const gap = () =>
    screen.getByText(/kcal$/, { selector: "p.font-mono" }).textContent!;

  it("groups the thousands in the average gap", () => {
    // Default profile → maintenance ≈ 2,556, so one 210 kcal day is a
    // four-digit gap. The regex pins the SEPARATOR, not the value: it
    // does not re-derive the number through the code under test.
    render(<CalorieBalanceChart meals={[meal(1, 210)]} />);
    expect(gap()).toMatch(new RegExp(`^\\+\\d{1,3}${SEP_RE}\\d{3} kcal$`));
  });

  it("groups them in the other direction too", () => {
    render(<CalorieBalanceChart meals={[meal(1, 9000)]} />);
    expect(gap()).toMatch(new RegExp(`^-\\d{1,3}${SEP_RE}\\d{3} kcal$`));
  });

  it("counts against the window it actually charts", () => {
    render(<CalorieBalanceChart meals={[meal(1, 210)]} />);
    const charted = points().length;
    expect(charted).toBe(14);
    // Today is excluded from the count, so the denominator is one less
    // than the number of days on the chart.
    expect(screen.getByText(`1 / ${charted - 1}`)).toBeInTheDocument();
  });
});

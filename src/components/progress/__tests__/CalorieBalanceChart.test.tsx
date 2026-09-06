import { cleanup, render, screen } from "@testing-library/react";
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

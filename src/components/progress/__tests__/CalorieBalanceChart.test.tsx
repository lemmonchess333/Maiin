import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { format, subDays } from "date-fns";
import type { Meal } from "@/hooks/useMeals";
import { T5_BARS_MIN_COUNT } from "@/lib/dataConfidence";

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
/* Midday, derived from the real date rather than written as a literal
   so `unit-future` cannot age it out. The fixtures build their dates
   from `new Date()` and the component reads the clock again at render;
   unpinned, a run that straddles local midnight sees a meal shift a day
   and the logged-day count move under it. That was survivable while the
   card drew the same chart whatever the count — it is not now that three
   logged days is a visible state boundary.

   `AnimatePresence initial={false}` means the plot area is at its
   settled opacity on first paint, so freezing framer's frame loop here
   changes nothing. A test reaching for `toBeVisible()` would have to
   settle it while the fake clock is still installed. */
beforeEach(() => {
  vi.useFakeTimers();
  const midday = new Date();
  midday.setHours(12, 0, 0, 0);
  vi.setSystemTime(midday);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});
const meal = (daysAgo: number, calories: number) =>
  ({
    date: format(subDays(new Date(), daysAgo), "yyyy-MM-dd"),
    totalCalories: calories,
  }) as Meal;
/** `n` distinct PAST days carrying one meal each, 1..n days ago — never
 *  today, which the card excludes and the gate therefore never counts. */
const loggedPast = (n: number, calories = 210) =>
  Array.from({ length: n }, (_, i) => meal(i + 1, calories));
/** The card's own minimum, imported rather than written as a 3 here, so
 *  moving the constant moves the boundary these tests probe. */
const ENOUGH = T5_BARS_MIN_COUNT;
const points = () =>
  JSON.parse(screen.getByTestId("chart-data").textContent!) as {
    balance: number | null;
  }[];
const chartDrawn = () => screen.queryByTestId("chart-data") !== null;

/**
 * Hist5d T5: "bar charts gated on >=3 bars (omit when fewer, no
 * substitute)."
 *
 * The rule was locked, built into `dataConfidence.ts`, and then wired to
 * nothing — `hasBars` had no consumer anywhere in the app. So this card
 * drew a full plot for two logged days out of thirteen: two posts,
 * eleven gaps, a y-axis scaled to whichever post was taller. Eleven gaps
 * in a row read as a shape.
 *
 * What the lock does NOT allow is a replacement graphic in the plot
 * area. The tests below pin both halves: the chart goes, and the figures
 * beneath it stay (pin 3, "raw numbers always shown — suppression only
 * abstracts visual decorations").
 */
describe("the chart draws only once there are bars to compare", () => {
  it("omits the chart one day short of the minimum", () => {
    render(<CalorieBalanceChart meals={loggedPast(ENOUGH - 1)} />);
    expect(chartDrawn(), "a two-bar chart is a stat in chart clothing").toBe(
      false
    );
  });

  it("draws at exactly the minimum", () => {
    render(<CalorieBalanceChart meals={loggedPast(ENOUGH)} />);
    expect(chartDrawn()).toBe(true);
  });

  it("counts LOGGED days, not the width of the window", () => {
    /* The window is fourteen points wide whatever the user has done, so
       a gate fed `data.length` reads 14 for an account with no food at
       all and never fires. The mutation that looks right and is not. */
    render(<CalorieBalanceChart meals={[]} />);
    expect(chartDrawn()).toBe(false);
  });

  it("does not count today, which it never charts either", () => {
    /* Two past days plus a meal logged today is still two bars. If the
       gate counted today the card would draw a chart whose third bar it
       then refuses to plot. */
    render(<CalorieBalanceChart meals={[...loggedPast(2), meal(0, 500)]} />);
    expect(chartDrawn()).toBe(false);
  });

  it("carries one short muted line, inside the locked budget", () => {
    render(<CalorieBalanceChart meals={loggedPast(1)} />);
    const caveat = screen.getByText(
      new RegExp(`^Log ${ENOUGH} days to see the chart$`)
    );
    /* Pin 6 caps suppression copy at 30 characters, and pin 7 makes the
       activity-gated register an action rather than patience. The
       shared `suppressionCaveatCopy` is held to the budget by its own
       test; this line is written at the surface (cross-cut pin 5,
       because the shared string for `bars` names a RUN) so nothing else
       would catch it going long. */
    expect(caveat.textContent!.length).toBeLessThanOrEqual(30);
    expect(caveat.className).toContain("text-muted-foreground");
  });

  it("puts nothing in the plot area in the chart's place", () => {
    /* "No substitute" is the lock's own phrase. A hexagon empty state, a
       placeholder illustration or a headline here would each be a
       graphic standing in for the chart. */
    render(<CalorieBalanceChart meals={loggedPast(1)} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps every raw figure while the chart is withheld", () => {
    /* Pin 3. The count and the average are what the reader still has,
       and the gate is about the decoration, not about the numbers. */
    render(<CalorieBalanceChart meals={loggedPast(2)} />);
    expect(screen.getByText("2 / 13")).toBeInTheDocument();
    expect(screen.getByText("Average logged-day gap")).toBeInTheDocument();
    expect(screen.getByText("Past days with entries")).toBeInTheDocument();
    expect(
      screen.getByText(/does not predict weight change/)
    ).toBeInTheDocument();
  });

  it("keeps the heading and its \u24d8 while the chart is withheld", () => {
    render(<CalorieBalanceChart meals={loggedPast(1)} />);
    expect(screen.getByText("Calorie balance")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "How calorie balance is measured" })
    );
    expect(screen.getByText(/Estimated maintenance/)).toBeInTheDocument();
  });
});

describe("nutrition evidence limits", () => {
  it("does not chart unlogged days as zero-intake deficits", () => {
    /* Was asserted against an EMPTY account, where the T5 gate now
       answers first and there is no chart to read. The property is
       about the days AROUND the logged ones, so it needs a drawn chart
       to mean anything: three logged days and ten silent ones. */
    render(<CalorieBalanceChart meals={loggedPast(ENOUGH)} />);
    const charted = points();
    expect(charted.filter((point) => point.balance !== null)).toHaveLength(
      ENOUGH
    );
    expect(
      charted.some((point) => point.balance === 0),
      "an unlogged day is unknown, never a zero-intake day"
    ).toBe(false);
  });

  it("says so in the footer when nothing at all is logged", () => {
    /* The other half of the test above. With no chart to inspect, the
       assertion that survives is the footer's own words — and pin 3
       keeps that footer on screen. */
    render(<CalorieBalanceChart meals={[]} />);
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
    expect(screen.getByText("0 / 13")).toBeInTheDocument();
  });
  it("does not forecast weight loss from today's single banana", () => {
    /* Today is still in progress, so its partial log must never become
       a bar. Three past days carry the card over the gate; the banana
       is the fourth meal and must still count for nothing. */
    render(
      <CalorieBalanceChart meals={[...loggedPast(ENOUGH), meal(0, 210)]} />
    );
    const charted = points();
    expect(
      charted[charted.length - 1].balance,
      "today is the last point and is never charted"
    ).toBeNull();
    expect(screen.getByText(`${ENOUGH} / 13`)).toBeInTheDocument();
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
    render(
      <CalorieBalanceChart meals={[...loggedPast(ENOUGH), meal(0, 100)]} />
    );
    expect(points().filter((point) => point.balance !== null)).toHaveLength(
      ENOUGH
    );
    expect(screen.getByText(`${ENOUGH} / 13`)).toBeInTheDocument();
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
    // Needs a drawn chart, because the denominator is asserted against
    // the chart's own point count — that is the whole guard.
    render(<CalorieBalanceChart meals={loggedPast(ENOUGH)} />);
    const charted = points().length;
    expect(charted).toBe(14);
    // Today is excluded from the count, so the denominator is one less
    // than the number of days on the chart.
    expect(screen.getByText(`${ENOUGH} / ${charted - 1}`)).toBeInTheDocument();
  });
});

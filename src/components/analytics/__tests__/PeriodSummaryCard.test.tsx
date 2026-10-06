import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import PeriodSummaryCard, { type SummaryFigure } from "../PeriodSummaryCard";
import type { SummaryBin } from "@/lib/periodSummary";

/**
 * The overview's period summary (DS3, "the month"). It replaced the three
 * rings, and carries over what their tests held: the heading names a
 * rolling window (`periodSummary.test.ts`), the words under the numbers
 * are words, and the plan it draws is the user's own, never one the app
 * made up.
 */

const FIGURES: SummaryFigure[] = [
  {
    metric: "sessions",
    value: "18",
    unit: "sessions",
    change: { direction: "up", text: "2" },
  },
  {
    metric: "volume",
    value: "52.8k",
    unit: "kg lifted",
    change: { direction: "down", text: "3.4k kg" },
  },
  { metric: "distance", value: "52.0", unit: "km run", change: null },
];

const WEEKS: SummaryBin[] = [
  {
    key: "2026-08-24",
    lifts: 1,
    runs: 0,
    volumeKg: 8200,
    distanceM: 0,
    current: false,
  },
  {
    key: "2026-08-31",
    lifts: 2,
    runs: 1,
    volumeKg: 16400,
    distanceM: 12400,
    current: false,
  },
  {
    key: "2026-09-07",
    lifts: 0,
    runs: 0,
    volumeKg: 0,
    distanceM: 0,
    current: false,
  },
  {
    key: "2026-09-14",
    lifts: 3,
    runs: 2,
    volumeKg: 21000,
    distanceM: 30100,
    current: false,
  },
  {
    key: "2026-09-21",
    lifts: 1,
    runs: 1,
    volumeKg: 7200,
    distanceM: 9500,
    current: true,
  },
];

function card(
  overrides: Partial<Parameters<typeof PeriodSummaryCard>[0]> = {}
) {
  return render(
    <PeriodSummaryCard
      title="Last 30 days"
      comparedWith="the 30 days before"
      figures={FIGURES}
      bins={WEEKS}
      granularity="weekly"
      plannedThisWeek={5}
      distanceUnit="km"
      {...overrides}
    />
  );
}

describe("PeriodSummaryCard", () => {
  it("heads the card with the window and what it is compared with", () => {
    card();
    expect(
      screen.getByRole("heading", { name: "Last 30 days" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Compared with the 30 days before")
    ).toBeInTheDocument();
  });

  it("shows each figure over the word that says what it counts", () => {
    card();
    for (const f of FIGURES) {
      expect(screen.getByText(f.value)).toBeInTheDocument();
      expect(screen.getByText(f.unit)).toBeInTheDocument();
    }
  });

  it("keeps the numeral face on the numbers, not on the words", () => {
    card();
    expect(screen.getByText("52.8k").className).toContain("font-mono");
    expect(screen.getByText("kg lifted").className).not.toContain("font-mono");
  });

  it("reads a rise in the status green and a drop in plain text", () => {
    card();
    // A drop after a hard block is a plan working, not an alarm.
    const up = screen.getByText(/Up 2 on the 30 days before/).parentElement!;
    const down = screen.getByText(
      /Down 3.4k kg on the 30 days before/
    ).parentElement!;
    expect(up.className).toContain("text-success-strong");
    expect(down.className).toContain("text-muted-foreground");
    expect(down.className).not.toMatch(/destructive|running|warning/);
  });

  it("says nothing for a figure with no change to report", () => {
    card();
    // Two of the three figures carry a change; "52.0 km run" has none.
    expect(screen.getAllByText(/ on the 30 days before$/)).toHaveLength(2);
  });

  it("describes every bar to a screen reader", () => {
    card();
    const chart = screen.getByRole("img");
    const label = chart.getAttribute("aria-label") ?? "";
    expect(label).toContain("31 Aug: 2 lifts and 1 run");
    // en-GB spells September "Sept" in current ICU and "Sep" in older.
    expect(label).toMatch(/7 Sept?: 0 lifts and 0 runs/);
    expect(label).toContain("This week: 1 lift and 1 run, 5 planned");
  });

  it("outlines the rest of this week's plan", () => {
    const { container } = card();
    expect(container.querySelectorAll("rect[stroke-dasharray]")).toHaveLength(
      1
    );
    expect(screen.getByText("Planned")).toBeInTheDocument();
  });

  it("draws no plan when the user has set none, not one it made up", () => {
    const { container } = card({ plannedThisWeek: 0 });
    expect(container.querySelectorAll("rect[stroke-dasharray]")).toHaveLength(
      0
    );
    expect(screen.queryByText("Planned")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain(
      "planned"
    );
  });

  it("draws no outline once the week's plan is done", () => {
    const { container } = card({ plannedThisWeek: 2 });
    expect(container.querySelectorAll("rect[stroke-dasharray]")).toHaveLength(
      0
    );
  });

  it("plans by the week only: a day or a month has no weekly target", () => {
    const { container } = card({ granularity: "monthly" });
    expect(container.querySelectorAll("rect[stroke-dasharray]")).toHaveLength(
      0
    );
  });

  it("stacks lifting purple under running coral", () => {
    const { container } = card();
    expect(container.querySelectorAll("rect.fill-lifting").length).toBe(4);
    expect(container.querySelectorAll("rect.fill-running").length).toBe(3);
  });

  it("colours the bars by class, never by var() in an SVG attribute", () => {
    // WKWebView does not reliably substitute var() in a presentation
    // attribute, and the bars would not draw on the iPhone.
    const { container } = card();
    for (const el of container.querySelectorAll("svg *")) {
      for (const attr of ["fill", "stroke"]) {
        expect(el.getAttribute(attr) ?? "").not.toContain("var(");
      }
    }
  });

  it("names a month's year once under the chart, on its first label", () => {
    const y = new Date().getFullYear();
    const month = (key: string, current = false): SummaryBin => ({
      key,
      lifts: 2,
      runs: 1,
      volumeKg: 9000,
      distanceM: 8000,
      current,
    });
    card({
      granularity: "monthly",
      bins: [
        month(`${y - 1}-10-01`),
        month(`${y - 1}-11-01`),
        month(`${y - 1}-12-01`),
        month(`${y}-01-01`, true),
      ],
    });
    const labels = screen.getByTestId("axis-labels");
    expect(within(labels).getByText("This month")).toBeInTheDocument();
    expect(within(labels).getByText(`Oct ${y - 1}`)).toBeInTheDocument();
    expect(within(labels).getByText("Nov")).toBeInTheDocument();
    expect(within(labels).getByText("Dec")).toBeInTheDocument();
  });

  it("names the current bar in the labels under the chart", () => {
    card();
    const labels = screen.getByTestId("axis-labels");
    expect(within(labels).getByText("This week")).toBeInTheDocument();
    expect(within(labels).getByText("31 Aug")).toBeInTheDocument();
  });

  it("names only the chart's two ends in the row for a narrow card", () => {
    card();
    const full = screen.getByTestId("axis-labels").textContent;
    const ends = within(screen.getByTestId("axis-ends"))
      .getAllByText(/./)
      .map((el) => el.textContent);
    expect(ends).toHaveLength(2);
    expect(ends[1]).toBe("This week");
    expect(full).toContain(ends[0]!);
  });
});

describe("History feeds the plan from the profile, not a literal", () => {
  /* The component tests cannot see this: passing `plannedThisWeek={5}`
     at the call site would bring back the flat five a week the rings
     used to measure every user against, with every test above green. */
  const history = readFileSync("src/pages/History.tsx", "utf8");
  const call = history.slice(
    history.indexOf("<PeriodSummaryCard"),
    history.indexOf("/>", history.indexOf("plannedThisWeek="))
  );

  it("takes the lift days from the profile", () => {
    expect(call).toMatch(/profile\?\.daysPerWeek \?\? 0/);
  });

  it("takes the runs through the canonical resolver", () => {
    expect(call).toContain("getWeeklyRunTarget(profile)");
  });

  it("passes no numeric literal", () => {
    expect(call).not.toMatch(/plannedThisWeek=\{\d/);
  });
});

describe("the figures switch the bars", () => {
  const chart = () => screen.getByRole("img");
  const option = (name: RegExp) => screen.getByRole("radio", { name });

  it("starts on sessions, as one choice of three", () => {
    card();
    const group = screen.getByRole("radiogroup", {
      name: "Show on the chart",
    });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(option(/sessions/)).toHaveAttribute("aria-checked", "true");
    expect(option(/kg lifted/)).toHaveAttribute("aria-checked", "false");
    expect(chart().getAttribute("aria-label")).toMatch(/^Sessions: /);
  });

  it("draws kilograms lifted, week by week, in purple alone", () => {
    const { container } = card();
    fireEvent.click(option(/kg lifted/));
    expect(option(/kg lifted/)).toHaveAttribute("aria-checked", "true");
    const label = chart().getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Kilograms lifted: /);
    expect(label).toContain("31 Aug: 16.4k kg");
    expect(label).toMatch(/7 Sept?: 0 kg/);
    expect(label).toContain("This week: 7.2k kg");
    expect(container.querySelectorAll("rect.fill-running")).toHaveLength(0);
    // Four weeks with kilograms, one drawn empty.
    expect(container.querySelectorAll("rect.fill-lifting")).toHaveLength(4);
    expect(container.querySelectorAll("rect.fill-muted")).toHaveLength(1);
  });

  it("draws distance run in the reader's unit, in coral alone", () => {
    const { container } = card({ distanceUnit: "mi" });
    fireEvent.click(option(/km run/));
    const label = chart().getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Distance run: /);
    // en-GB spells September "Sept" in current ICU and "Sep" in older.
    expect(label).toMatch(/14 Sept?: 18\.7 mi/);
    expect(container.querySelectorAll("rect.fill-lifting")).toHaveLength(0);
    expect(container.querySelectorAll("rect.fill-running")).toHaveLength(3);
  });

  it("scales each measure to its own tallest week", () => {
    const { container } = card();
    fireEvent.click(option(/kg lifted/));
    const heights = [...container.querySelectorAll("rect.fill-lifting")].map(
      (r) => Number(r.getAttribute("height"))
    );
    // 21,000 kg is the tallest week, so it fills the chart.
    expect(Math.max(...heights)).toBeCloseTo(86, 0);
    expect(heights[0] / Math.max(...heights)).toBeCloseTo(8200 / 21000, 2);
  });

  it("outlines the plan only on the sessions bars", () => {
    const { container } = card();
    fireEvent.click(option(/kg lifted/));
    expect(container.querySelectorAll("rect[stroke-dasharray]")).toHaveLength(
      0
    );
    expect(screen.queryByText("Planned")).toBeNull();
    fireEvent.click(option(/sessions/));
    expect(container.querySelectorAll("rect[stroke-dasharray]")).toHaveLength(
      1
    );
  });

  it("names the one series each measure draws", () => {
    card();
    fireEvent.click(option(/kg lifted/));
    expect(screen.queryByText("Lifts")).toBeNull();
    expect(screen.queryByText("Runs")).toBeNull();
    // The legend's words, beside the figure's own "kg lifted".
    expect(screen.getAllByText("kg lifted")).toHaveLength(2);
  });

  it("moves the choice with the arrow keys, wrapping", () => {
    card();
    const sessions = option(/sessions/);
    sessions.focus();
    fireEvent.keyDown(sessions, { key: "ArrowLeft" });
    expect(option(/km run/)).toHaveAttribute("aria-checked", "true");
    expect(option(/km run/)).toHaveFocus();
    fireEvent.keyDown(option(/km run/), { key: "ArrowRight" });
    expect(option(/sessions/)).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(option(/sessions/), { key: "End" });
    expect(option(/km run/)).toHaveAttribute("aria-checked", "true");
  });

  it("keeps one figure in the tab order: the chosen one", () => {
    card();
    expect(
      screen.getAllByRole("radio").map((r) => r.getAttribute("tabindex"))
    ).toEqual(["0", "-1", "-1"]);
  });

  it("holds the choice when the range changes", () => {
    const { rerender } = card();
    fireEvent.click(option(/kg lifted/));
    rerender(
      <PeriodSummaryCard
        title="Last 3 months"
        comparedWith="the 3 months before"
        figures={FIGURES}
        bins={WEEKS}
        granularity="weekly"
        plannedThisWeek={5}
        distanceUnit="km"
      />
    );
    expect(option(/kg lifted/)).toHaveAttribute("aria-checked", "true");
  });
});

describe("an account younger than the range", () => {
  it("says when it began and shows no change on a range it didn't exist in", () => {
    card({ comparedWith: null, sinceLabel: "Since you joined on 2 Oct" });
    expect(screen.getByText("Since you joined on 2 Oct")).toBeInTheDocument();
    expect(screen.queryByText(/Compared with/)).toBeNull();
    expect(screen.queryByText("↑", { exact: false })).toBeNull();
  });
});

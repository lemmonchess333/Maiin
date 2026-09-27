import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
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
  { value: "18", unit: "sessions", change: { direction: "up", text: "2" } },
  {
    value: "52.8k",
    unit: "kg lifted",
    change: { direction: "down", text: "6%" },
  },
  { value: "52.0", unit: "km run", change: null },
];

const WEEKS: SummaryBin[] = [
  { key: "2026-08-24", lifts: 1, runs: 0, current: false },
  { key: "2026-08-31", lifts: 2, runs: 1, current: false },
  { key: "2026-09-07", lifts: 0, runs: 0, current: false },
  { key: "2026-09-14", lifts: 3, runs: 2, current: false },
  { key: "2026-09-21", lifts: 1, runs: 1, current: true },
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
      /Down 6% on the 30 days before/
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
    const fills = [...container.querySelectorAll("rect")].map((r) =>
      r.getAttribute("fill")
    );
    expect(fills).toContain("hsl(var(--lifting))");
    expect(fills).toContain("hsl(var(--running))");
  });

  it("names the current bar in the labels under the chart", () => {
    card();
    const labels = screen.getByText("This week").parentElement!;
    expect(within(labels).getByText("31 Aug")).toBeInTheDocument();
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

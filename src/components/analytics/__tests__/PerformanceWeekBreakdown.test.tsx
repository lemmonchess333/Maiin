import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PerformanceWeekBreakdown from "../PerformanceWeekBreakdown";
import type { WeekBreakdown } from "@/lib/performanceWeekBreakdown";
import { groupText } from "@/test/localeGrouping";

const BREAKDOWN: WeekBreakdown = {
  measures: [
    {
      key: "lifting",
      label: "Lifting",
      value: 16240,
      valueText: "16.2k kg",
      usual: 13700,
      usualText: "13.7k kg",
      detail: "4 sessions",
    },
    {
      key: "running",
      label: "Running",
      value: 0,
      valueText: "0.0 km",
      usual: 26,
      usualText: "26.0 km",
      detail: "No runs in these 7 days",
    },
  ],
  food: { daysLogged: 6, caloriesPerDay: 2184, proteinPerDay: 148 },
};

describe("PerformanceWeekBreakdown", () => {
  it("heads the card with the window the score covers", () => {
    render(<PerformanceWeekBreakdown breakdown={BREAKDOWN} />);
    expect(
      screen.getByRole("heading", { name: "The last 7 days" })
    ).toBeInTheDocument();
  });

  it("states each figure, what it was made of, and the usual week", () => {
    render(<PerformanceWeekBreakdown breakdown={BREAKDOWN} />);
    const card = screen.getByRole("region", { name: "The last 7 days" });
    expect(within(card).getByText("16.2k kg")).toBeInTheDocument();
    expect(within(card).getByText(/4 sessions/)).toBeInTheDocument();
    expect(within(card).getByText("13.7k kg")).toBeInTheDocument();
    expect(
      within(card).getByText(/No runs in these 7 days/)
    ).toBeInTheDocument();
  });

  it("marks the usual week on the bar, the week's figure filling it", () => {
    render(<PerformanceWeekBreakdown breakdown={BREAKDOWN} />);
    const lifting = screen.getByTestId("against-usual-lifting");
    const fill = lifting.firstElementChild as HTMLElement;
    const tick = lifting.querySelector("[data-usual-tick]") as HTMLElement;
    // Scaled to the larger of the two, with headroom: 16,240 is the larger.
    expect(parseFloat(fill.style.width)).toBeCloseTo(100 / 1.15, 1);
    expect(parseFloat(tick.style.left)).toBeCloseTo(
      (13700 / (16240 * 1.15)) * 100,
      1
    );
    expect(lifting).toHaveAttribute("aria-hidden", "true");
  });

  it("draws an empty week as an empty bar with the usual week still marked", () => {
    render(<PerformanceWeekBreakdown breakdown={BREAKDOWN} />);
    const running = screen.getByTestId("against-usual-running");
    expect(
      parseFloat((running.firstElementChild as HTMLElement).style.width)
    ).toBe(0);
    expect(running.querySelector("[data-usual-tick]")).not.toBeNull();
  });

  it("gives the food logged, with the numbers in the numeral face and the words not", () => {
    render(<PerformanceWeekBreakdown breakdown={BREAKDOWN} />);
    expect(screen.getByText("6 of 7 days")).toBeInTheDocument();
    const kcal = screen.getByText(groupText(2184));
    expect(kcal.className).toContain("font-mono");
    expect(kcal.parentElement!.textContent).toMatch(
      /kcal and 148 g protein a day, on the days logged/
    );
  });

  it("draws no bar where there is no usual week", () => {
    render(
      <PerformanceWeekBreakdown
        breakdown={{
          measures: [
            { ...BREAKDOWN.measures[0], usual: null, usualText: null },
          ],
          food: null,
        }}
      />
    );
    expect(screen.queryByTestId("against-usual-lifting")).toBeNull();
    expect(screen.queryByText(/usual week/)).toBeNull();
  });

  it("renders nothing with nothing to say", () => {
    const { container } = render(
      <PerformanceWeekBreakdown breakdown={{ measures: [], food: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

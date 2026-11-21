import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import LoadAgainstUsual from "../LoadAgainstUsual";
import type { WeekMeasure } from "@/lib/performanceWeekBreakdown";

const MEASURES: WeekMeasure[] = [
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
];

describe("LoadAgainstUsual", () => {
  it("states each figure, what it was made of, and the usual week", () => {
    render(<LoadAgainstUsual measures={MEASURES} />);
    const list = screen.getByRole("list", { name: "Against your usual week" });
    expect(within(list).getByText("16.2k kg")).toBeInTheDocument();
    expect(within(list).getByText(/4 sessions/)).toBeInTheDocument();
    expect(within(list).getByText("13.7k kg")).toBeInTheDocument();
    expect(
      within(list).getByText(/No runs in these 7 days/)
    ).toBeInTheDocument();
  });

  it("marks the usual week on the bar, the week's figure filling it", () => {
    render(<LoadAgainstUsual measures={MEASURES} />);
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
    render(<LoadAgainstUsual measures={MEASURES} />);
    const running = screen.getByTestId("against-usual-running");
    expect(
      parseFloat((running.firstElementChild as HTMLElement).style.width)
    ).toBe(0);
    expect(running.querySelector("[data-usual-tick]")).not.toBeNull();
  });

  it("draws no bar where there is no usual week", () => {
    render(
      <LoadAgainstUsual
        measures={[{ ...MEASURES[0], usual: null, usualText: null }]}
      />
    );
    expect(screen.getByText("16.2k kg")).toBeInTheDocument();
    expect(screen.queryByTestId("against-usual-lifting")).toBeNull();
    expect(screen.queryByText(/usual week/)).toBeNull();
  });

  it("renders nothing with nothing to say", () => {
    const { container } = render(<LoadAgainstUsual measures={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

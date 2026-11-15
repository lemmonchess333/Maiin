import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import RunStatGrid from "../RunStatGrid";

/** The run detail's and the run finish's four numbers (DS3). */
describe("RunStatGrid", () => {
  const stats = [
    { label: "Time", value: "30:00" },
    { label: "Average pace", value: "6:00", unit: "/km" },
    { label: "Elevation gain", value: "30", unit: "m" },
    { label: "Calories", value: "310", unit: "kcal" },
  ];

  it("puts each label over its figure", () => {
    render(<RunStatGrid stats={stats} />);
    for (const { label } of stats) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Time").nextElementSibling).toHaveTextContent(
      "30:00"
    );
  });

  it("spaces a unit from its figure, for a screen reader too", () => {
    render(<RunStatGrid stats={stats} />);
    expect(
      screen.getByText("Elevation gain").nextElementSibling!.textContent
    ).toBe("30 m");
    expect(screen.getByText("Calories").nextElementSibling!.textContent).toBe(
      "310 kcal"
    );
  });

  it("sets the figures plain, with no colour of their own", () => {
    render(<RunStatGrid stats={stats} />);
    const pace = screen.getByText("Average pace").nextElementSibling!;
    expect(pace).toHaveClass("text-foreground");
    expect(pace.className).not.toMatch(/text-(teal|success|running|warning)/);
  });

  it("sets a second figure under the first as a line of text (Run28 call 2)", () => {
    render(
      <RunStatGrid
        stats={[
          {
            label: "Moving time",
            value: "28:50",
            detail: { label: "Elapsed time", value: "30:00" },
          },
          ...stats.slice(1),
        ]}
      />
    );
    const figure = screen.getByText("Moving time").nextElementSibling!;
    expect(figure).toHaveTextContent("28:50");
    const detail = figure.nextElementSibling as HTMLElement;
    expect(detail.textContent).toBe("Elapsed time 30:00");
    // A number in a line of text: the text face, tabular (DESIGN_GUIDE §0).
    expect(within(detail).getByText("30:00")).toHaveClass(
      "font-mono",
      "tabular-nums"
    );
  });
});

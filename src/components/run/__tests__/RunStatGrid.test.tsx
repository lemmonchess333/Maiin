import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});

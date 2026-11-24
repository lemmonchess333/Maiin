import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import FoodAverages, { type FoodAverage } from "../FoodAverages";

const LEAD: FoodAverage = {
  key: "calories",
  label: "Avg calories",
  value: "2,224",
  unit: "kcal/day",
  delta: { value: "1%", positive: false },
  target: "target 2,350 kcal",
  sparkline: [2100, 2300, 2200, 2250],
  lineColor: "#D9884E",
};

const ROWS: FoodAverage[] = [
  {
    key: "protein",
    label: "Protein",
    value: "163",
    unit: "g/day",
    delta: { value: "1%", positive: true },
    target: "target 181g",
    lineColor: "#c084fc",
  },
  {
    key: "fat",
    label: "Fat",
    value: "69",
    unit: "g/day",
    lineColor: "#14b8a6",
  },
];

describe("FoodAverages: one lead figure, the rest as rows", () => {
  it("leads with calories and says what it stands against", () => {
    render(<FoodAverages lead={LEAD} rows={ROWS} />);
    expect(screen.getByText("2,224")).toBeInTheDocument();
    expect(
      screen.getByText("↓1% vs last · target 2,350 kcal")
    ).toBeInTheDocument();
  });

  it("draws each macro as a row with its figure and its line", () => {
    render(<FoodAverages lead={LEAD} rows={ROWS} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Protein")).toBeInTheDocument();
    expect(within(rows[0]).getByText("163")).toBeInTheDocument();
    expect(
      within(rows[0]).getByText("↑1% vs last · target 181g")
    ).toBeInTheDocument();
  });

  it("leaves out the line under a row that has nothing to stand against", () => {
    render(<FoodAverages lead={LEAD} rows={ROWS} />);
    const fat = screen.getAllByRole("listitem")[1];
    expect(fat.textContent).toBe("Fat69 g/day");
  });
});

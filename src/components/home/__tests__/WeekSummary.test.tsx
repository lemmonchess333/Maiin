import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WeekSummary from "../WeekSummary";

function counts(
  lifts: [number, number],
  runs: [number, number],
  foodDays: number
) {
  return {
    lifts: { done: lifts[0], planned: lifts[1] },
    runs: { done: runs[0], planned: runs[1] },
    foodDays,
    foodDayTotal: 7,
  };
}

describe("WeekSummary", () => {
  it("shows each discipline against its plan, and food out of seven days", () => {
    render(<WeekSummary counts={counts([2, 4], [1, 3], 5)} />);
    expect(
      screen.getByRole("group", { name: "Lifts: 2 of 4" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Runs: 1 of 3" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Food logged: 5 of 7 days" })
    ).toBeInTheDocument();
  });

  it("leaves out a discipline the week neither planned nor logged", () => {
    // A runner who does not lift is not shown "0 of 0 lifts" every week.
    render(<WeekSummary counts={counts([0, 0], [2, 3], 1)} />);
    expect(screen.queryByRole("group", { name: /^Lifts/ })).toBeNull();
    expect(screen.getAllByRole("group")).toHaveLength(2);
  });

  it("shows a logged session the plan did not have, without a denominator", () => {
    render(<WeekSummary counts={counts([1, 0], [0, 3], 0)} />);
    expect(screen.getByRole("group", { name: "Lifts: 1" })).toBeInTheDocument();
  });

  it("always shows food, the one every week has", () => {
    render(<WeekSummary counts={counts([0, 0], [0, 0], 0)} />);
    expect(
      screen.getByRole("group", { name: "Food logged: 0 of 7 days" })
    ).toBeInTheDocument();
  });

  it("fills a bar by the share of the plan done, and no further", () => {
    const { container } = render(
      <WeekSummary counts={counts([6, 4], [1, 4], 7)} />
    );
    const fills = [
      ...container.querySelectorAll<HTMLElement>("[role=group] > div > div"),
    ].map((el) => el.style.width);
    expect(fills).toEqual(["100%", "25%", "100%"]);
  });
});

describe("WeekSummary in the week the account began", () => {
  it("counts food against the days since joining", () => {
    render(
      <WeekSummary
        counts={{
          lifts: { done: 1, planned: 1 },
          runs: { done: 0, planned: 0 },
          foodDays: 3,
          foodDayTotal: 3,
        }}
      />
    );
    expect(
      screen.getByRole("group", { name: "Food logged: 3 of 3 days" })
    ).toBeInTheDocument();
  });
});

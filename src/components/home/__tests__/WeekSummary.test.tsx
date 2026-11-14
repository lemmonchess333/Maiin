import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WeekSummary from "../WeekSummary";

/** Done and planned for each; a null plan is a week with none. */
function counts(
  lifts: [number, number | null],
  runs: [number, number | null],
  foodDays: number
) {
  return {
    lifts: { done: lifts[0], planned: lifts[1] },
    runs: { done: runs[0], planned: runs[1] },
    foodDays,
    foodDayTotal: 7,
  };
}

/** The line's parts as read, in order: ["Lifts 2 of 4", …]. */
function parts(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim());
}

describe("WeekSummary", () => {
  it("lists each discipline against its plan, and food out of seven days", () => {
    render(<WeekSummary counts={counts([2, 4], [1, 3], 5)} />);
    expect(parts()).toEqual([
      "Lifts 2 of 4",
      "Runs 1 of 3",
      "Food logged 5 of 7 days",
    ]);
    expect(
      screen.getByRole("list", { name: "This week so far" })
    ).toBeInTheDocument();
  });

  /* Trim1 call 1. The line above Home's segments is the week's sessions
     ("2 of 3 sessions this week"). With one discipline that line is the
     discipline's count, and listing it here would say it twice in one
     card, which is what the "This week" card was removed for. */
  it("leaves a lone discipline to the line above the segments", () => {
    render(<WeekSummary counts={counts([2, 3], [0, null], 1)} />);
    expect(parts()).toEqual(["Food logged 1 of 7 days"]);
  });

  it("leaves a lone runner's runs to the line above the segments too", () => {
    render(<WeekSummary counts={counts([0, null], [2, 3], 1)} runner />);
    expect(parts()).toEqual(["Food logged 1 of 7 days"]);
  });

  it("leaves out a discipline the week neither planned nor logged", () => {
    // A runner who does not lift is not shown "Lifts 0" every week.
    render(<WeekSummary counts={counts([0, null], [2, 3], 1)} />);
    expect(parts().some((p) => p.startsWith("Lifts"))).toBe(false);
  });

  it("lists a runner's runs from the week's start, with nothing planned", () => {
    // A free-run plan has no run days; beside a lifting plan the runs
    // are there before the week's first run, not only after it (Home4).
    render(<WeekSummary counts={counts([0, 3], [0, null], 0)} runner />);
    expect(parts()).toEqual([
      "Lifts 0 of 3",
      "Runs 0",
      "Food logged 0 of 7 days",
    ]);
  });

  it("leaves Runs out for someone who does not run", () => {
    render(<WeekSummary counts={counts([0, 3], [0, null], 0)} />);
    expect(parts().some((p) => p.startsWith("Runs"))).toBe(false);
  });

  it("lists a logged session the plan did not have, without a denominator", () => {
    render(<WeekSummary counts={counts([1, null], [0, 3], 0)} />);
    expect(parts()).toEqual([
      "Lifts 1",
      "Runs 0 of 3",
      "Food logged 0 of 7 days",
    ]);
  });

  it("always lists food, the one every week has", () => {
    render(<WeekSummary counts={counts([0, null], [0, null], 0)} />);
    expect(parts()).toEqual(["Food logged 0 of 7 days"]);
  });

  it("draws no bars: the week's segments are the picture", () => {
    const { container } = render(
      <WeekSummary counts={counts([6, 4], [1, 4], 7)} />
    );
    expect(container.querySelector("[style*='width']")).toBeNull();
    expect(container.querySelectorAll("div")).toHaveLength(0);
  });
});

describe("WeekSummary in the week the account began", () => {
  it("counts food against the days since joining", () => {
    render(
      <WeekSummary
        counts={{
          lifts: { done: 1, planned: 1 },
          runs: { done: 0, planned: null },
          foodDays: 3,
          foodDayTotal: 3,
        }}
      />
    );
    expect(parts()).toEqual(["Food logged 3 of 3 days"]);
  });
});

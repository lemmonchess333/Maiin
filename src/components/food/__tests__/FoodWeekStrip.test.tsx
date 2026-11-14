import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import FoodWeekStrip from "../FoodWeekStrip";
import { foodWeek } from "@/lib/foodWeek";
import type { DayTarget } from "@/lib/foodDays";
import { group } from "@/test/localeGrouping";

/* The week is built by the real model, so these read the strip the page
   renders rather than hand-made day objects that could drift from it.
   Wednesday 30 September 2026 is today throughout. */
function days({
  selectedKey = "2026-09-30",
  meals = [] as { id: string; date: string; totalCalories: number }[],
  snapshots = new Map<string, DayTarget>(),
  selectedTarget = 2000,
  startKey = null as string | null,
} = {}) {
  return foodWeek({
    selectedKey,
    todayKey: "2026-09-30",
    minKey: "2026-07-02",
    meals,
    hiddenMealIds: new Set(),
    snapshots,
    selectedTarget,
    startKey,
  });
}

function dayButton(name: RegExp) {
  return screen.getByRole("button", { name });
}

function bar(name: RegExp) {
  return dayButton(name).querySelector<HTMLElement>("[data-week-bar]")!;
}

function fillWidth(name: RegExp) {
  return dayButton(name).querySelector<HTMLElement>("[data-week-fill]")!.style
    .width;
}

describe("FoodWeekStrip", () => {
  it("shows the Monday-to-Sunday week, named for its first day", () => {
    render(<FoodWeekStrip days={days()} onSelect={() => {}} />);
    const week = screen.getByRole("group", { name: "Week of 28 September" });
    expect(within(week).getAllByRole("button")).toHaveLength(7);
    expect(dayButton(/^Monday 28 September/)).toBeInTheDocument();
    expect(dayButton(/^Sunday 4 October/)).toBeInTheDocument();
  });

  it("marks today and the day in view", () => {
    render(
      <FoodWeekStrip
        days={days({ selectedKey: "2026-09-29" })}
        onSelect={() => {}}
      />
    );
    const today = dayButton(/^Wednesday 30 September/);
    expect(today).toHaveAttribute("aria-current", "date");
    expect(today.getAttribute("aria-label")).toMatch(/\(today\)$/);
    expect(today).toHaveAttribute("aria-pressed", "false");
    expect(dayButton(/^Tuesday 29 September/)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("opens a past day, and leaves the days to come shut", () => {
    const onSelect = vi.fn();
    render(<FoodWeekStrip days={days()} onSelect={onSelect} />);
    fireEvent.click(dayButton(/^Monday 28 September/));
    expect(onSelect).toHaveBeenCalledWith("2026-09-28");

    const thursday = dayButton(/^Thursday 1 October/);
    expect(thursday).toBeDisabled();
    fireEvent.click(thursday);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("says what was eaten against the day's target", () => {
    render(
      <FoodWeekStrip
        days={days({
          meals: [{ id: "a", date: "2026-09-28", totalCalories: 1080 }],
          snapshots: new Map([
            ["2026-09-28", { calories: 2350, protein: 150 }],
          ]),
        })}
        onSelect={() => {}}
      />
    );
    expect(dayButton(/^Monday 28 September/)).toHaveAttribute(
      "aria-label",
      `Monday 28 September, ${group(1080)} of ${group(2350)} kcal`
    );
  });

  it("says how far over a day went", () => {
    render(
      <FoodWeekStrip
        days={days({
          meals: [{ id: "a", date: "2026-09-30", totalCalories: 2600 }],
          selectedTarget: 2000,
        })}
        onSelect={() => {}}
      />
    );
    expect(dayButton(/^Wednesday 30 September/)).toHaveAttribute(
      "aria-label",
      `Wednesday 30 September, ${group(2600)} of ${group(2000)} kcal, 600 over (today)`
    );
  });

  it("names an empty day, a day with no target, and a day to come", () => {
    render(
      <FoodWeekStrip
        days={days({
          meals: [{ id: "a", date: "2026-09-29", totalCalories: 1500 }],
          selectedTarget: 0,
        })}
        onSelect={() => {}}
      />
    );
    expect(dayButton(/^Monday 28 September/)).toHaveAttribute(
      "aria-label",
      "Monday 28 September, nothing logged"
    );
    expect(dayButton(/^Tuesday 29 September/)).toHaveAttribute(
      "aria-label",
      `Tuesday 29 September, ${group(1500)} kcal`
    );
    expect(dayButton(/^Thursday 1 October/)).toHaveAttribute(
      "aria-label",
      "Thursday 1 October"
    );
  });

  it("lays a darker length over the bar only for a day over its target", () => {
    render(
      <FoodWeekStrip
        days={days({
          meals: [
            { id: "a", date: "2026-09-30", totalCalories: 2600 },
            { id: "b", date: "2026-09-29", totalCalories: 1900 },
          ],
          snapshots: new Map([
            ["2026-09-29", { calories: 2000, protein: 150 }],
          ]),
          selectedTarget: 2000,
        })}
        onSelect={() => {}}
      />
    );
    const over = (name: RegExp) =>
      dayButton(name).querySelector<HTMLElement>("[data-week-over]");
    // 600 over 2,000: a full bar with 30% of it darker.
    expect(over(/^Wednesday 30 September/)!.style.width).toBe("30%");
    expect(fillWidth(/^Wednesday 30 September/)).toBe("100%");
    expect(over(/^Tuesday 29 September/)).toBeNull();
    expect(fillWidth(/^Tuesday 29 September/)).toBe("95%");
  });

  it("fades the groove of a day that has not come yet", () => {
    // At full strength an empty bar says nothing was logged, which is
    // true only of a day that has been.
    render(<FoodWeekStrip days={days()} onSelect={() => {}} />);
    expect(bar(/^Thursday 1 October/)).toHaveClass("opacity-45");
    expect(fillWidth(/^Thursday 1 October/)).toBe("0%");
    expect(bar(/^Monday 28 September/)).not.toHaveClass("opacity-45");
  });

  it("names a day before the account began as such, with a faded groove", () => {
    render(
      <FoodWeekStrip
        days={days({ startKey: "2026-09-29" })}
        onSelect={() => {}}
      />
    );
    const monday = dayButton(/^Monday 28 September/);
    expect(monday.getAttribute("aria-label")).toMatch(/, before you joined$/);
    expect(bar(/^Monday 28 September/)).toHaveClass("opacity-45");
    expect(
      dayButton(/^Tuesday 29 September/).getAttribute("aria-label")
    ).toMatch(/nothing logged/);
    expect(bar(/^Tuesday 29 September/)).not.toHaveClass("opacity-45");
  });
});

/**
 * The drawing, since Food11 call 4: a short bar a day, where the strip
 * drew a 40px ring with the date inside it.
 */
describe("FoodWeekStrip — seven bars, edge to edge", () => {
  it("draws a bar a day and no ring", () => {
    const { container } = render(
      <FoodWeekStrip days={days()} onSelect={() => {}} />
    );
    expect(container.querySelectorAll("[data-week-bar]")).toHaveLength(7);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("fills a day's bar with the share of its target that was logged", () => {
    render(
      <FoodWeekStrip
        days={days({
          meals: [{ id: "a", date: "2026-09-28", totalCalories: 1080 }],
          snapshots: new Map([
            ["2026-09-28", { calories: 2400, protein: 150 }],
          ]),
        })}
        onSelect={() => {}}
      />
    );
    expect(fillWidth(/^Monday 28 September/)).toBe("45%");
    // A day that has been, with nothing logged: an empty bar.
    expect(fillWidth(/^Tuesday 29 September/)).toBe("0%");
  });

  it("prints the day's letter and no date; the date stays in its name", () => {
    render(<FoodWeekStrip days={days()} onSelect={() => {}} />);
    const monday = dayButton(/^Monday 28 September/);
    expect(monday).toHaveTextContent(/^M$/);
  });

  it("gives the gutters back, so a day is 45px wide on a 320px phone", () => {
    render(<FoodWeekStrip days={days()} onSelect={() => {}} />);
    const week = screen.getByRole("group", { name: "Week of 28 September" });
    expect(week).toHaveClass("-mx-[16px]", "grid-cols-7");
    for (const day of within(week).getAllByRole("button")) {
      expect(day).toHaveClass("min-h-[44px]");
    }
  });

  it("outlines the bar of the day in view, and only that one", () => {
    render(
      <FoodWeekStrip
        days={days({ selectedKey: "2026-09-29" })}
        onSelect={() => {}}
      />
    );
    expect(bar(/^Tuesday 29 September/)).toHaveClass("ring-foreground");
    expect(bar(/^Wednesday 30 September/)).not.toHaveClass("ring-foreground");
  });

  it("fills with the deeper orange step, which follows the theme", () => {
    // The food orange is 2.35 to 1 on the light page; the bars print no
    // number, so the drawing has to be readable alone.
    const { container } = render(
      <FoodWeekStrip days={days()} onSelect={() => {}} />
    );
    for (const fill of container.querySelectorAll("[data-week-fill]")) {
      expect(fill).toHaveClass("bg-nutrition-strong");
    }
  });
});

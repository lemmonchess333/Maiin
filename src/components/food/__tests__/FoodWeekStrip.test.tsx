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
} = {}) {
  return foodWeek({
    selectedKey,
    todayKey: "2026-09-30",
    minKey: "2026-07-02",
    meals,
    hiddenMealIds: new Set(),
    snapshots,
    selectedTarget,
  });
}

function dayButton(name: RegExp) {
  return screen.getByRole("button", { name });
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

  it("draws the second lap only for a day over its target", () => {
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
    const rings = (name: RegExp) =>
      dayButton(name).querySelectorAll("svg").length;
    expect(rings(/^Wednesday 30 September/)).toBe(2);
    expect(rings(/^Tuesday 29 September/)).toBe(1);
  });

  it("draws no track on a day that has not come yet", () => {
    render(<FoodWeekStrip days={days()} onSelect={() => {}} />);
    const track = (name: RegExp) =>
      dayButton(name).querySelector("circle")?.getAttribute("stroke");
    expect(track(/^Thursday 1 October/)).toBe("transparent");
    expect(track(/^Monday 28 September/)).not.toBe("transparent");
  });
});

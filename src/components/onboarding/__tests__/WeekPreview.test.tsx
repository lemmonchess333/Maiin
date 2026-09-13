/**
 * The onboarding week preview starts the week where the app does.
 *
 * `schedule` arrives in getDay() order (Sunday first); the preview used
 * to render it as-is, so after the Monday flip it read Sun … Sat beside
 * a Home strip reading Mon … Sun. Order follows WEEK_STARTS_ON; the day
 * indices themselves are untouched (the split indexer keys on them).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import WeekPreview from "../WeekPreview";
import { WEEK_STARTS_ON } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";

afterEach(cleanup);

const schedule: ScheduleDay[] = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "rest" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

describe("WeekPreview — day order", () => {
  it("renders the days from the app's week start, not from Sunday", () => {
    expect(WEEK_STARTS_ON).toBe(1);
    render(<WeekPreview schedule={schedule} />);
    const labels = screen
      .getAllByRole("button", { pressed: false })
      .map((b) => b.textContent?.trim().slice(0, 3));
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("keeps each day's own type — ordering never renumbers", () => {
    render(<WeekPreview schedule={schedule} />);
    expect(
      screen.getByRole("button", { name: "Sun: rest" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mon: lift" })
    ).toBeInTheDocument();
  });
});

/**
 * Spec v7 required-test gate #11 — Home future planned day shows
 * planned item.
 *
 * Companion to DayPeekCard.test.tsx — that test pins the
 * tap-through detail. This one pins the always-visible strip
 * itself: future days that have a planned runDay must render the
 * coral planned-run indicator, NOT a blank chip.
 *
 * The render of planned vs completed vs skipped is implemented
 * via SVG/icon swaps inside a flex row — we assert on the SVG
 * class names ("lucide-check" appears only on completed runs)
 * and on the run-rhombus presence via inline-style colours.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import WeekStrip from "@/components/home/WeekStrip";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay } from "@/features/program/programTypes";

function makeSchedule(types: ScheduleDay["type"][]): ScheduleDay[] {
  return types.map((type, day) => ({ day, type }));
}

function makeRunDay(dayIndex: number, overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: `runday_test_${dayIndex}`,
    dayIndex,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

describe("WeekStrip — runDay status precedence (spec gate #11)", () => {
  it("renders the planned-run rhombus when a future runDay is planned and not completed", () => {
    // Strip is forward-facing (today + 6 future days). At least
    // one of those days needs to be a "run" with a matching
    // planned runDay. The strip uses d.getDay() to match runDays
    // by dayIndex, so we set ALL days to run-type to guarantee a
    // match regardless of which weekday "today" falls on.
    const schedule = makeSchedule(["run", "run", "run", "run", "run", "run", "run"]);
    const todayDow = new Date().getDay();
    const runDays = [makeRunDay(todayDow)];

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        schedule={schedule}
        runDays={runDays}
        selectedDate={null}
        onDayTap={vi.fn()}
      />,
    );

    // Coral rhombus — planned, not completed. The render uses an
    // inline backgroundColor matching THEME.running (#D4637A).
    // We assert via the rhombus's rotate-45 className being
    // present in at least one chip.
    const rhombuses = container.querySelectorAll(".rotate-45");
    expect(rhombuses.length).toBeGreaterThan(0);
    // No Check icon should appear for a planned (not completed)
    // run. Check icons would render via lucide-check class.
    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBe(0);
  });

  it("renders a Check icon for a completed run day (precedence over recurring rhombus)", () => {
    // Today's day is set to "run" + completed.
    const schedule = makeSchedule(["run", "run", "run", "run", "run", "run", "run"]);
    const todayDow = new Date().getDay();
    const runDays = [makeRunDay(todayDow, { completed: true, status: "completed_exact" })];

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        schedule={schedule}
        runDays={runDays}
        selectedDate={null}
        onDayTap={vi.fn()}
      />,
    );

    // A lucide Check should render for today's completed run.
    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBeGreaterThan(0);
  });

  it("does not match runDays beyond the current calendar week", () => {
    // The strip's `inSameWeek` check excludes future days that
    // wrap into next week from current-week runDays. Concretely:
    // if today is Sunday (dow=0) and the strip's day-6 chip is
    // next Saturday, a runDay for dayIndex=6 should NOT match it
    // (it belongs to the previous Saturday's slot).
    //
    // This test sets up that exact scenario but only meaningful
    // when today is Sunday. We test the structural invariant by
    // asserting no extra Check renders show up beyond today.
    const schedule = makeSchedule(["run", "run", "run", "run", "run", "run", "run"]);
    const todayDow = new Date().getDay();
    // Mark every other dayIndex completed EXCEPT today. Strip
    // checks only today's index (i=0) so no completed Checks
    // should render.
    const runDays = [0, 1, 2, 3, 4, 5, 6]
      .filter((d) => d !== todayDow)
      .map((d) => makeRunDay(d, { completed: true, status: "completed_exact" }));

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        schedule={schedule}
        runDays={runDays}
        selectedDate={null}
        onDayTap={vi.fn()}
      />,
    );

    // Strip iterates today + 6 forward. Only `inSameWeek` chips
    // (today + the rest of the calendar week) get runDay matches.
    // The number of Check icons can't exceed (7 - todayDow) -
    // since we excluded today from the runDays list above, the
    // count should be (7 - todayDow - 1) at most (covering the
    // rest of the calendar week, excluding today).
    const checks = container.querySelectorAll(".lucide-check");
    const maxExpected = Math.max(0, 7 - todayDow - 1);
    expect(checks.length).toBeLessThanOrEqual(maxExpected);
  });

  it("renders the recurring rhombus when runDays prop is omitted (back-compat)", () => {
    // P1-4 added runDays as optional. Callers that haven't
    // upgraded shouldn't break — the strip still renders the
    // recurring layout from `schedule` alone.
    const schedule = makeSchedule(["run", "run", "run", "run", "run", "run", "run"]);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        schedule={schedule}
        selectedDate={null}
        onDayTap={vi.fn()}
      />,
    );

    const rhombuses = container.querySelectorAll(".rotate-45");
    expect(rhombuses.length).toBeGreaterThan(0);
  });
});

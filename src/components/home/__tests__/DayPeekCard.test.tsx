/**
 * Spec v7 required-test gate #11 — "Home future planned day shows
 * planned item, not 'No activity logged'."
 *
 * DayPeekCard is the surface where a user taps a future day on
 * the Home WeekStrip and reads what's planned. The pre-P1-4 card
 * had a hard binary: either logged activity OR "No activity
 * logged". A future planned run rendered as the latter — the
 * planned slot was invisible.
 *
 * P1-4 added runDays-awareness so a planned-but-undone future
 * day surfaces "Run scheduled" instead. This test pins that
 * contract end-to-end at the component level.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DayPeekCard from "@/components/home/DayPeekCard";
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

function emptyTotals() {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 };
}

describe("DayPeekCard — future planned run rendering (spec gate #11)", () => {
  it("renders 'Run scheduled' for a future run day with no logged activity", () => {
    // Pick a date that maps to Tuesday (day 2) so we can pin the
    // expected runDay match precisely.
    // 2026-05-19 is a Tuesday.
    const futureTuesday = "2026-05-19";
    const schedule = makeSchedule(["rest", "lift", "run", "lift", "run", "rest", "lift"]);
    const runDays = [makeRunDay(2)]; // planned tempo Tuesday

    render(
      <DayPeekCard
        dateKey={futureTuesday}
        schedule={schedule}
        runDays={runDays}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    // The spec gate: "Run scheduled" must appear, NOT the empty-
    // state copy.
    expect(screen.getByText("Run scheduled")).toBeInTheDocument();
    expect(screen.queryByText("No activity logged")).not.toBeInTheDocument();
  });

  it("falls back to 'No activity logged' when there's no planned run + no logged activity", () => {
    // Same future Tuesday but runDays is empty AND today is a
    // rest day per the schedule. The card has nothing to surface.
    const futureTuesday = "2026-05-19";
    const schedule = makeSchedule(["rest", "rest", "rest", "rest", "rest", "rest", "rest"]);

    render(
      <DayPeekCard
        dateKey={futureTuesday}
        schedule={schedule}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("No activity logged")).toBeInTheDocument();
    expect(screen.queryByText("Run scheduled")).not.toBeInTheDocument();
  });

  it("renders 'Run completed' with a check when the runDay is marked completed", () => {
    const futureTuesday = "2026-05-19";
    const schedule = makeSchedule(["rest", "lift", "run", "lift", "run", "rest", "lift"]);
    const runDays = [makeRunDay(2, { completed: true, status: "completed_exact" })];

    render(
      <DayPeekCard
        dateKey={futureTuesday}
        schedule={schedule}
        runDays={runDays}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Run completed")).toBeInTheDocument();
  });

  it("renders 'Run skipped' for a skipped runDay", () => {
    const futureTuesday = "2026-05-19";
    const schedule = makeSchedule(["rest", "lift", "run", "lift", "run", "rest", "lift"]);
    const runDays = [makeRunDay(2, { status: "skipped" })];

    render(
      <DayPeekCard
        dateKey={futureTuesday}
        schedule={schedule}
        runDays={runDays}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Run skipped")).toBeInTheDocument();
  });

  it("stacks the run row alongside workout + meal lines when all are present", () => {
    const futureTuesday = "2026-05-19";
    const schedule = makeSchedule(["rest", "lift", "both", "lift", "run", "rest", "lift"]);
    const runDays = [makeRunDay(2)];

    render(
      <DayPeekCard
        dateKey={futureTuesday}
        schedule={schedule}
        runDays={runDays}
        workouts={[{ durationMinutes: 45 }]}
        dailyTotals={{ ...emptyTotals(), calories: 1800, protein: 120, mealCount: 3 }}
        onClose={vi.fn()}
      />,
    );

    // All three rows visible; the planned run is no longer
    // invisible just because workouts/meals exist.
    expect(screen.getByText("Run scheduled")).toBeInTheDocument();
    expect(screen.getByText(/1 session/)).toBeInTheDocument();
    expect(screen.getByText(/1,800 cal/)).toBeInTheDocument();
  });
});

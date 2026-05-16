/**
 * Spec v7 required-test gate #11 — "Home future planned day shows
 * planned item, not 'No activity logged'."
 *
 * DayPeekCard is the surface where a user taps a future day on
 * the Home WeekStrip and reads what's planned. PR-0c shifts the
 * lookup from a `runDays.find(r => r.dayIndex === dow)` inline
 * match (which leaked this-Monday's status into next Monday) to
 * the shared training resolver, which enforces date/weekKey-
 * aware matching with a legacy fallback gated to the current
 * generated week.
 *
 * Tests pin both the planned-day surface (gate #11) AND the
 * PR-0c correctness contract: a next-week date never inherits
 * this-week's runDay status.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DayPeekCard from "@/components/home/DayPeekCard";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState, ScheduledRunDay } from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

function makeSchedule(types: ScheduleDay["type"][]): ScheduleDay[] {
  return types.map((type, day) => ({ day, type }));
}

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: `runday_test_${overrides.dayIndex ?? 2}`,
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

function makeProfile(weekSchedule: ScheduleDay[]): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weekSchedule,
  } as UserProfile;
}

function makeProgramState(runDays: ScheduledRunDay[]): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts: [],
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays,
  } as ProgramState;
}

function emptyTotals() {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 };
}

// Today (per CLAUDE.md context) is Saturday 2026-05-16. Build the
// test dates around that so resolver matching exercises the
// real same-week / future-week branches.
const TODAY_DOW = new Date().getDay();
// Pick a date in this calendar week for the planned-run cases.
// Today is in the strip, so a Tuesday in this week is either past
// or future depending on the weekday — but the resolver matches
// by date string regardless of "future vs past".
const dayOfThisWeek = (dow: number): string => {
  const todaySunday = new Date();
  todaySunday.setDate(todaySunday.getDate() - TODAY_DOW + dow);
  const y = todaySunday.getFullYear();
  const m = String(todaySunday.getMonth() + 1).padStart(2, "0");
  const d = String(todaySunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

describe("DayPeekCard — planned run rendering (spec gate #11, resolver-aware)", () => {
  it("renders 'Run scheduled' for a planned run day with date+weekKey set", () => {
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule(["rest", "lift", "run", "lift", "run", "rest", "lift"]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: 2, date: tueKey, weekKey: tueWeekKey }),
    ]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Run scheduled")).toBeInTheDocument();
    expect(screen.queryByText("No activity logged")).not.toBeInTheDocument();
  });

  it("falls back to 'No activity logged' when there's no planned run + no logged activity", () => {
    const tueKey = dayOfThisWeek(2);
    const schedule = makeSchedule(["rest", "rest", "rest", "rest", "rest", "rest", "rest"]);
    const profile = makeProfile(schedule);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={makeProgramState([])}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("No activity logged")).toBeInTheDocument();
    expect(screen.queryByText("Run scheduled")).not.toBeInTheDocument();
  });

  it("renders 'Run completed' with a check when the runDay is marked completed", () => {
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule(["rest", "lift", "run", "lift", "run", "rest", "lift"]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({
        dayIndex: 2, date: tueKey, weekKey: tueWeekKey,
        completed: true, status: "completed_exact",
      }),
    ]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Run completed")).toBeInTheDocument();
  });

  it("renders 'Run skipped' for a skipped runDay", () => {
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule(["rest", "lift", "run", "lift", "run", "rest", "lift"]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: 2, date: tueKey, weekKey: tueWeekKey, status: "skipped" }),
    ]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Run skipped")).toBeInTheDocument();
  });

  it("stacks the run row alongside workout + meal lines when all are present", () => {
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule(["rest", "lift", "both", "lift", "run", "rest", "lift"]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: 2, date: tueKey, weekKey: tueWeekKey }),
    ]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        workouts={[{ durationMinutes: 45 }]}
        dailyTotals={{ ...emptyTotals(), calories: 1800, protein: 120, mealCount: 3 }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Run scheduled")).toBeInTheDocument();
    expect(screen.getByText(/1 session/)).toBeInTheDocument();
    expect(screen.getByText(/1,800 cal/)).toBeInTheDocument();
  });
});

describe("DayPeekCard — PR-0c: next-week date does NOT inherit this-week runDay status", () => {
  it("a runDay completed THIS Tuesday does not surface as completed for NEXT Tuesday's peek", () => {
    // This Tuesday (relative to today)
    const thisTueKey = dayOfThisWeek(2);
    const thisTueWeekKey = localWeekKey(parseLocalDate(thisTueKey));
    // Next Tuesday: same dow=2, but 7 days later
    const nextTue = parseLocalDate(thisTueKey);
    nextTue.setDate(nextTue.getDate() + 7);
    const nextTueKey = `${nextTue.getFullYear()}-${String(nextTue.getMonth() + 1).padStart(2, "0")}-${String(nextTue.getDate()).padStart(2, "0")}`;

    const schedule = makeSchedule(["rest", "lift", "run", "lift", "run", "rest", "lift"]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({
        dayIndex: 2,
        date: thisTueKey,
        weekKey: thisTueWeekKey,
        status: "completed_exact",
        completed: true,
      }),
    ]);

    // Render the peek for NEXT Tuesday
    render(
      <DayPeekCard
        dateKey={nextTueKey}
        profile={profile}
        programState={programState}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />,
    );

    // The runDay's `date` is this Tuesday — exact match fails for
    // next Tuesday, weekKey fails too, legacy fallback doesn't
    // apply (the runDay has both date and weekKey). Resolver
    // returns null. No "Run completed" copy, no "Run scheduled"
    // copy — there's just no run row at all for next Tuesday.
    expect(screen.queryByText("Run completed")).not.toBeInTheDocument();
    expect(screen.queryByText("Run scheduled")).not.toBeInTheDocument();
    expect(screen.getByText("No activity logged")).toBeInTheDocument();
  });
});

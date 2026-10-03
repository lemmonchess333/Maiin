import { describe, expect, it } from "vitest";
import { trainingWeek, weekDays, type WeekRun } from "../trainingWeek";
import type { ScheduledRunDay } from "@/features/program/programTypes";

/**
 * The training week every screen counts: Home's "This week", the finish
 * screens' "Your week so far" and plan row, and the weekly recap. Called
 * with the plan and the sessions as the app stores them, at a fixed
 * moment, so nothing here reads the clock the suite runs under.
 */

/* The week of Monday 14 September 2026, read on its Wednesday. */
const WEEK = "2026-09-14";
const NOW = new Date(2026, 8, 16, 14, 30);
const [MON, TUE, WED, THU, FRI, SAT, SUN] = weekDays(WEEK);

type Kind = "lift" | "run" | "both" | "rest";
/** A seven-day schedule, Sunday first, as `weekSchedule` stores it. */
const schedule = (...kinds: Kind[]) =>
  kinds.map((type, day) => ({ day, type }));
/* Sun rest, Mon lift, Tue run, Wed lift, Thu run, Fri lift, Sat rest. */
const LIFT_AND_RUN = schedule(
  "rest",
  "lift",
  "run",
  "lift",
  "run",
  "lift",
  "rest"
);

const run = (day: string, extra: Partial<WeekRun> = {}): WeekRun => ({
  id: `run-${day}`,
  day,
  distance: 5000,
  duration: 1800,
  ...extra,
});

const runDay = (
  date: string,
  extra: Partial<ScheduledRunDay> = {}
): ScheduledRunDay =>
  ({
    id: `day-${date}`,
    date,
    templateId: "easy_30",
    ...extra,
  }) as ScheduledRunDay;

/** A profile's `createdAt` as Firestore returns it: noon on that day. */
const createdOn = (day: string) => ({
  toMillis: () => new Date(`${day}T12:00:00`).getTime(),
});

const week = (input: Partial<Parameters<typeof trainingWeek>[0]> = {}) =>
  trainingWeek({
    weekKey: WEEK,
    profile: { weekSchedule: LIFT_AND_RUN },
    programState: null,
    workouts: [],
    runs: [],
    now: NOW,
    ...input,
  });

describe("lifts", () => {
  it("counts every session saved in the week, planned day or not", () => {
    const counts = week({
      workouts: [
        { date: MON },
        { date: TUE }, // a rest-from-lifting day: it still happened
        { date: TUE },
        { date: "2026-09-13" }, // the Sunday before
        { date: "2026-09-21" }, // the Monday after
      ],
    });
    expect(counts.lifts.done).toBe(3);
  });

  it("plans the schedule's lift days", () => {
    expect(week().lifts.planned).toBe(3);
    const both = week({
      profile: {
        weekSchedule: schedule(
          "rest",
          "both",
          "rest",
          "lift",
          "rest",
          "rest",
          "rest"
        ),
      },
    });
    expect(both.lifts.planned).toBe(2);
  });

  it("has no planned lifts when the schedule plans none", () => {
    const runner = week({
      profile: {
        weekSchedule: schedule(
          "rest",
          "run",
          "rest",
          "run",
          "rest",
          "run",
          "rest"
        ),
      },
    });
    expect(runner.lifts.planned).toBeNull();
  });

  it("plans from the day the account began", () => {
    // Joined on the Thursday: Monday's and Wednesday's lifts were never planned.
    const counts = week({
      profile: { weekSchedule: LIFT_AND_RUN, createdAt: createdOn(THU) },
    });
    expect(counts.lifts.planned).toBe(1);
  });
});

describe("runs planned", () => {
  it("are the plan's run days in the week", () => {
    const counts = week({
      programState: {
        runDays: [
          runDay(TUE),
          runDay(THU),
          runDay(SAT),
          runDay("2026-09-12"), // the Saturday before
        ],
      },
    });
    expect(counts.runs.planned).toBe(3);
  });

  it("follow a run moved to another day, not the schedule's weekdays", () => {
    // The schedule runs Tuesday and Thursday; Thursday's run was moved to
    // Wednesday, a lift day, and done there.
    const counts = week({
      programState: { runDays: [runDay(TUE), runDay(WED)] },
      runs: [run(TUE), run(WED)],
    });
    expect(counts.runs).toMatchObject({ planned: 2, done: 2 });
  });

  it("are none for a free runner, whose week is done-only", () => {
    const counts = week({ runs: [run(TUE)] });
    expect(counts.runs).toMatchObject({ planned: null, done: 1 });
  });

  it("start on the day the account began", () => {
    const counts = week({
      profile: { weekSchedule: LIFT_AND_RUN, createdAt: createdOn(WED) },
      programState: { runDays: [runDay(TUE), runDay(THU), runDay(SAT)] },
    });
    expect(counts.runs.planned).toBe(2);
  });

  it("place an undated run day in the week the plan was made for", () => {
    // An older plan's run day carries only a weekday (Tuesday).
    const undated = {
      id: "legacy",
      dayIndex: 2,
      templateId: "easy_30",
    } as ScheduledRunDay;
    expect(week({ programState: { runDays: [undated] } }).runs.planned).toBe(1);
    // Read the week before, it is not that week's plan.
    expect(
      trainingWeek({
        weekKey: "2026-09-07",
        profile: { weekSchedule: LIFT_AND_RUN },
        programState: { runDays: [undated] },
        workouts: [],
        runs: [],
        now: NOW,
      }).runs.planned
    ).toBeNull();
  });
});

describe("runs done", () => {
  it("count the runs that count, on the day each belongs to", () => {
    const counts = week({
      runs: [
        run(MON),
        run(SUN),
        // Started on the Sunday before, finished on this Monday: last week's.
        run("2026-09-13"),
        run("2026-09-21"),
      ],
    });
    expect(counts.runs.done).toBe(2);
  });

  it("leave out a run saved anyway, flagged invalid, or too short", () => {
    const counts = week({
      runs: [
        run(MON),
        run(TUE, { savedAnyway: true }),
        run(WED, { isInvalid: true }),
        run(THU, { distance: 30 }),
        run(FRI, { duration: 20 }),
      ],
    });
    expect(counts.runs.done).toBe(1);
  });

  it("count a planned run marked done by hand, with no run to show", () => {
    const counts = week({
      programState: {
        runDays: [runDay(TUE), runDay(THU)],
        manualCompletions: { [`day-${TUE}`]: { completedAt: 0 } },
      },
    });
    expect(counts.runs).toMatchObject({ done: 1, planned: 2 });
  });

  it("count a marked run once when a run that counts is on that day", () => {
    const counts = week({
      programState: {
        runDays: [runDay(TUE)],
        manualCompletions: { [`day-${TUE}`]: { completedAt: 0 } },
      },
      runs: [run(TUE)],
    });
    expect(counts.runs.done).toBe(1);
  });

  it("count a planned run marked done under an older plan", () => {
    const counts = week({
      programState: {
        runDays: [
          runDay(TUE, {
            status: "completed_exact",
          } as Partial<ScheduledRunDay>),
        ],
      },
    });
    expect(counts.runs.done).toBe(1);
  });

  it("do not count a run marked done by hand before it was planned for", () => {
    // Joined on the Thursday; a Tuesday mark is from before the account.
    const counts = week({
      profile: { weekSchedule: LIFT_AND_RUN, createdAt: createdOn(THU) },
      programState: {
        runDays: [runDay(TUE)],
        manualCompletions: { [`day-${TUE}`]: { completedAt: 0 } },
      },
    });
    expect(counts.runs.done).toBe(0);
  });
});

describe("kilometres", () => {
  it("are the runs that count, to one decimal", () => {
    const counts = week({
      runs: [
        run(MON, { distance: 5210 }),
        run(TUE, { distance: 10_480 }),
        run(WED, { distance: 9000, savedAnyway: true }),
      ],
    });
    expect(counts.runs.km).toBe(15.7);
  });
});

describe("weekDays", () => {
  it("is Monday to Sunday", () => {
    expect(weekDays(WEEK)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });
});

/**
 * Cross-test: a league standing's planned sessions (functions/lib/
 * leaguePlanned.js, which the standings call) against the app's own count
 * of a week, src/lib/trainingWeek.ts, which Home's "This week", the finish
 * screens and the weekly recap read. ADR-0008: the server file required
 * here is the one that runs, on the same profiles and plans the app reads.
 *
 * The fixtures are the shapes that have broken week counts before: a plan
 * of lifts only, lifts with a dated run plan, a free runner (no run days,
 * a weekly target), an account that began mid-week, a race plan, a
 * schedule built from targets because none is stored, an older plan's
 * undated run days, and a week other than this one.
 *
 * The app's start day is the device's local date of `createdAt`; the
 * server's is the account's timezone. Each fixture's account is in the
 * zone this test runs in, which CI varies (Kiritimati, Midway, Auckland),
 * and every date is derived from the clock.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { trainingWeek } from "../trainingWeek";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "../dateHelpers";
import type { ScheduledRunDay } from "@/features/program/programTypes";

const require_ = createRequire(import.meta.url);
const server = require_("../../../functions/lib/leaguePlanned") as {
  DEFAULT_PLANNED: number;
  plannedInWeek: (
    profile: Record<string, unknown>,
    programState: Record<string, unknown> | null,
    weekKey: string,
    planWeekKey?: string
  ) => { lifts: number | null; runs: number | null };
  leaguePlanned: (
    profile: Record<string, unknown>,
    programState: Record<string, unknown> | null,
    weekKey: string,
    planWeekKey?: string
  ) => { lifts: number; runs: number; runsFromPlan: boolean; planned: number };
};

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const THIS_WEEK = localWeekKey(new Date());
const dayIn = (weekKey: string, i: number) =>
  localDateString(addLocalDays(parseLocalDate(weekKey), i));
const LAST_WEEK = dayIn(THIS_WEEK, -7);

/** A Firestore timestamp for local `hour` o'clock on `dateKey`. */
const at = (dateKey: string, hour = 9) => {
  const d = parseLocalDate(dateKey);
  d.setHours(hour);
  const ms = d.getTime();
  return { toMillis: () => ms };
};

const schedule = (types: Record<number, string>) =>
  Array.from({ length: 7 }, (_, day) => ({ day, type: types[day] ?? "rest" }));

const runDay = (
  fields: Partial<ScheduledRunDay> & { dayIndex: number }
): ScheduledRunDay => ({ templateId: "easy", type: "easy", ...fields });

interface Fixture {
  name: string;
  weekKey: string;
  profile: Record<string, unknown>;
  programState: { runDays?: ScheduledRunDay[] } | null;
}

function fixtures(): Fixture[] {
  const w = (i: number) => dayIn(THIS_WEEK, i);
  return [
    {
      name: "lift-only",
      weekKey: THIS_WEEK,
      profile: {
        weekSchedule: schedule({ 1: "lift", 2: "lift", 4: "lift", 6: "lift" }),
        weeklyRunDaysTarget: 0,
      },
      programState: { runDays: [] },
    },
    {
      name: "lifts with a dated run plan",
      weekKey: THIS_WEEK,
      profile: {
        weekSchedule: schedule({ 1: "lift", 3: "both", 5: "run", 6: "run" }),
        weeklyRunDaysTarget: 3,
      },
      programState: {
        runDays: [
          runDay({ id: "r1", date: w(2), dayIndex: 3 }),
          runDay({ id: "r2", date: w(4), dayIndex: 5 }),
          runDay({ id: "r3", date: w(5), dayIndex: 6, type: "long" }),
          // Last week's and next week's are not this week's.
          runDay({ id: "r0", date: dayIn(THIS_WEEK, -2), dayIndex: 6 }),
          runDay({ id: "r9", date: dayIn(THIS_WEEK, 8), dayIndex: 2 }),
        ],
      },
    },
    {
      name: "free runner",
      weekKey: THIS_WEEK,
      profile: {
        weekSchedule: schedule({ 2: "run", 4: "run", 6: "run" }),
        weeklyRunDaysTarget: 3,
        runMode: "freeform",
      },
      programState: { runDays: [] },
    },
    {
      name: "an account that began mid-week",
      weekKey: THIS_WEEK,
      profile: {
        weekSchedule: schedule({
          1: "lift",
          2: "run",
          3: "lift",
          5: "lift",
          6: "run",
        }),
        createdAt: at(w(3), 9), // Thursday
        timezone: ZONE,
      },
      programState: {
        runDays: [
          runDay({ id: "a", date: w(1), dayIndex: 2 }), // before the start
          runDay({ id: "b", date: w(5), dayIndex: 6 }),
        ],
      },
    },
    {
      name: "a race plan, race week",
      weekKey: THIS_WEEK,
      profile: {
        // No stored schedule: one built from the targets.
        weeklyWorkoutsTarget: 2,
        weeklyRunDaysTarget: 4,
        runMode: "race_prep",
        createdAt: at(dayIn(THIS_WEEK, -70), 20),
        timezone: ZONE,
      },
      programState: {
        runDays: [
          runDay({ id: "t1", date: w(0), dayIndex: 1, type: "tempo" }),
          runDay({ id: "t2", date: w(2), dayIndex: 3, type: "easy" }),
          runDay({ id: "t3", date: w(3), dayIndex: 4, type: "shakeout" }),
          runDay({
            id: "race",
            date: w(6),
            dayIndex: 0,
            templateId: "race",
            type: "race",
          }),
        ],
      },
    },
    {
      name: "an older plan's undated days, this week",
      weekKey: THIS_WEEK,
      profile: { weeklyWorkoutsTarget: 5, weeklyRunsTarget: 2 },
      programState: {
        runDays: [
          // weekKey and day, no date.
          runDay({ id: "k1", weekKey: THIS_WEEK, dayIndex: 2 }),
          // Neither: belongs to the week the plan was made for.
          runDay({ id: "k2", dayIndex: 4 }),
        ],
      },
    },
    {
      name: "an older plan's undated days, read for last week",
      weekKey: LAST_WEEK,
      profile: { weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 0 },
      programState: {
        runDays: [
          runDay({ id: "k1", weekKey: LAST_WEEK, dayIndex: 3 }),
          runDay({ id: "k2", dayIndex: 4 }),
        ],
      },
    },
    {
      // Which days a built schedule fills decides what a late start
      // leaves: Mon, Fri and Thu lift (and Wed, Tue run), so from Thursday
      // two lifts are left.
      name: "a schedule built from targets, begun on a Thursday",
      weekKey: THIS_WEEK,
      profile: {
        weeklyWorkoutsTarget: 3,
        weeklyRunDaysTarget: 2,
        createdAt: at(w(3), 7),
        timezone: ZONE,
      },
      programState: null,
    },
    {
      name: "seven lifts and seven runs (the Both overflow)",
      weekKey: THIS_WEEK,
      profile: { weeklyWorkoutsTarget: 7, weeklyRunDaysTarget: 7 },
      programState: null,
    },
    {
      name: "nothing planned",
      weekKey: THIS_WEEK,
      profile: { weekSchedule: schedule({}), weeklyRunDaysTarget: 0 },
      programState: null,
    },
  ];
}

describe("league planned ≡ trainingWeek's planned", () => {
  for (const f of fixtures()) {
    it(f.name, () => {
      const client = trainingWeek({
        weekKey: f.weekKey,
        profile: f.profile as Parameters<typeof trainingWeek>[0]["profile"],
        programState: f.programState,
        workouts: [],
        runs: [],
        now: new Date(),
      });
      const got = server.plannedInWeek(
        f.profile,
        f.programState,
        f.weekKey,
        THIS_WEEK
      );
      expect(got).toEqual({
        lifts: client.lifts.planned,
        runs: client.runs.planned,
      });
    });
  }

  it("the fixtures reach every branch: a lift-only week, runs from the plan, none, and a start mid-week", () => {
    const counts = fixtures().map((f) =>
      server.plannedInWeek(f.profile, f.programState, f.weekKey, THIS_WEEK)
    );
    expect(counts.some((c) => c.lifts !== null && c.runs === null)).toBe(true);
    expect(counts.some((c) => c.runs !== null && c.runs > 0)).toBe(true);
    expect(counts.some((c) => c.lifts === null && c.runs === null)).toBe(true);
    // The mid-week start leaves one lift (Friday) and one run (Saturday).
    expect(counts[3]).toEqual({ lifts: 1, runs: 1 });
  });
});

describe("the league's own rule on top", () => {
  it("adds the plan's lifts and runs", () => {
    const [, withRuns] = fixtures();
    expect(
      server.leaguePlanned(withRuns.profile, withRuns.programState, THIS_WEEK)
    ).toEqual({ lifts: 2, runs: 3, runsFromPlan: true, planned: 5 });
  });

  it("scores a free runner's runs against their weekly target", () => {
    const free = fixtures()[2];
    expect(
      server.leaguePlanned(free.profile, free.programState, THIS_WEEK)
    ).toEqual({ lifts: 0, runs: 3, runsFromPlan: false, planned: 3 });
    expect(
      server.leaguePlanned(
        { weekSchedule: schedule({ 1: "lift" }), weeklyRunsTarget: 2 },
        null,
        THIS_WEEK
      ).planned
    ).toBe(3);
  });

  it("scores a week that plans nothing out of 3", () => {
    const nothing = fixtures()[9];
    expect(
      server.leaguePlanned(nothing.profile, nothing.programState, THIS_WEEK)
        .planned
    ).toBe(server.DEFAULT_PLANNED);
    expect(server.DEFAULT_PLANNED).toBe(3);
  });
});

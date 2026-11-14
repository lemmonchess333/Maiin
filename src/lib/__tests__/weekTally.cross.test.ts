/**
 * Cross-test: the league's done count (functions/lib/weekTally.js
 * `tallyWeek`, which lib/leagues.js scores a standing with) against the
 * app's count of a week's sessions (`weekDone`, src/lib/trainingWeek.ts),
 * which Home's "This week", the finish screens, the weekly review and the
 * Following feed's week card read. ADR-0008: the server file required here
 * is the one the standings call.
 *
 * App1 Q14: every weekly count comes from one module. The server cannot
 * import it, so this pins the copy to it for what both count: a week's
 * recorded sessions, every saved workout and every run that counts.
 *
 * Two differences are the league's own, on purpose, and are pinned as such:
 *   - a planned run marked done by hand is a session on Home and none in
 *     the league, which scores recorded sessions only: a tick is not
 *     evidence another member can be ranked against;
 *   - a run past the shared credit bounds (sharedCreditBounds.js: farther
 *     than 500 km, or faster than 12 m/s) is credited to no shared total,
 *     the league's among them. The person's own week still counts it.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { weekDone, type WeekRun } from "../trainingWeek";
import type { ScheduledRunDay } from "@/features/program/programTypes";

const require_ = createRequire(import.meta.url);
const server = require_("../../../functions/lib/weekTally") as {
  tallyWeek: (
    workouts: readonly object[],
    runs: readonly object[]
  ) => { sessions: number; lifts: number; runs: number };
};

/** A Monday, and the week's days: the league tallies one week's docs. */
const WEEK = "2026-09-21";
const day = (i: number) => `2026-09-${String(21 + i).padStart(2, "0")}`;

const workout = (i: number) => ({ date: day(i), exercises: [] });
const run = (
  i: number,
  fields: Partial<WeekRun> = {}
): WeekRun & { date: string } => ({
  day: day(i),
  date: day(i),
  distance: 5000,
  duration: 1800,
  ...fields,
});

/** The week's recorded sessions in shapes that have counted two ways. */
const FIXTURES: {
  name: string;
  workouts: ReturnType<typeof workout>[];
  runs: ReturnType<typeof run>[];
}[] = [
  { name: "nothing", workouts: [], runs: [] },
  { name: "lifts only", workouts: [workout(0), workout(2)], runs: [] },
  { name: "runs only", workouts: [], runs: [run(1), run(3), run(6)] },
  {
    name: "two sessions on one day",
    workouts: [workout(0)],
    runs: [run(0), run(0, { distance: 3000, duration: 1200 })],
  },
  {
    name: "runs that count nowhere",
    workouts: [workout(4)],
    runs: [
      run(1),
      run(2, { isInvalid: true }),
      run(3, { savedAnyway: true }),
      run(4, { distance: 40 }),
      run(5, { duration: 20 }),
    ],
  },
  {
    name: "a treadmill and a manual entry",
    workouts: [],
    runs: [run(1, { place: "treadmill" }), run(2, { activityType: "manual" })],
  },
];

describe("the league's done count is the app's, for recorded sessions", () => {
  it.each(FIXTURES)("$name", ({ workouts, runs }) => {
    const app = weekDone({ weekKey: WEEK, workouts, runs });
    const league = server.tallyWeek(workouts, runs);
    expect(league.lifts).toBe(app.lifts);
    expect(league.runs).toBe(app.runs);
    expect(league.sessions).toBe(app.lifts + app.runs);
  });
});

describe("the league's own differences", () => {
  it("a planned run marked done by hand counts on Home, not in the league", () => {
    const runDay: ScheduledRunDay = {
      id: "rd1",
      date: day(2),
      dayIndex: 3,
      templateId: "easy",
      type: "easy",
    };
    const app = weekDone({
      weekKey: WEEK,
      workouts: [],
      runs: [],
      programState: {
        runDays: [runDay],
        manualCompletions: { rd1: { completedAt: 0 } },
      },
      now: new Date(2026, 8, 23, 12),
    });
    expect(app.runs).toBe(1);
    expect(server.tallyWeek([], []).runs).toBe(0);
  });

  it("a run past the shared credit bounds counts in the week, not the league", () => {
    // 600 km, and 5 km in 60 seconds: bad records, not big days.
    const runs = [
      run(1, { distance: 600_000, duration: 180_000 }),
      run(2, { distance: 5000, duration: 60 }),
    ];
    expect(weekDone({ weekKey: WEEK, workouts: [], runs }).runs).toBe(2);
    expect(server.tallyWeek([], runs).runs).toBe(0);
  });
});

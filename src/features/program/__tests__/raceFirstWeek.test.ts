/**
 * Run19's first week, when no run day is left in it. A race plan made after
 * its week's last run day (a Sunday, with runs on Tuesday, Wednesday and
 * Saturday) planned no run that week. The rollover moves a race plan on
 * from its runs' week (`weekRolloverAnchor`), so with none it never moved,
 * and the load's rebuild only rebuilt a week that had runs: the plan never
 * planned a run again. Such a plan starts on next week's runs, and one
 * saved empty before that is built on its next load.
 *
 * The dates are fixed and the clock is set to each day: everything here
 * takes its day as an argument or from the clock set.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { buildPlan } from "../planBuilder";
import { migrateProgramState } from "../migrations";
import { raceWeekNeedsBuilding } from "../programMaintenance";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { regenerateRacePlan, rollRunWeeks } from "../weekRollover";

/** The week of Monday 11 May 2026. */
const MONDAY = "2026-05-11";
const SUNDAY = "2026-05-17";
const NEXT_MONDAY = "2026-05-18";
const RACE = { distance: "10k" as const, targetDate: "2026-08-14" };
/** Lifts Monday, Thursday and Friday; runs Tuesday, Wednesday and Saturday
 *  (day 0 is Sunday). */
const TUE_WED_SAT_RUNS: ScheduleDay[] = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "run" },
  { day: 4, type: "lift" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));

afterEach(() => {
  vi.useRealTimers();
});

/** Runs `run` with the clock at noon on `day`. */
function onDay<T>(day: string, run: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(parseLocalDate(day).getTime() + 12 * 3600 * 1000);
  try {
    return run();
  } finally {
    vi.useRealTimers();
  }
}

const profile = {
  uid: "u",
  runMode: "race_prep",
  raceGoal: RACE,
  weekSchedule: TUE_WED_SAT_RUNS,
  weeklyRunDaysTarget: 3,
} as unknown as UserProfile;

/** The plan setup saves on `day`. */
function madeOn(day: string): ProgramState {
  return onDay(day, () =>
    migrateProgramState(
      normalizeProgramState(
        buildPlan({
          primaryGoal: "general",
          nutritionPhase: "recomp",
          experience: "intermediate",
          liftDays: 3,
          preferredSplit: "full_body",
          runMode: "race_prep",
          weeklyRunDays: 3,
          raceGoal: RACE,
          equipment: "full_gym",
          injuries: [],
          weekSchedule: TUE_WED_SAT_RUNS,
          currentDate: day,
        }).programState
      ),
      MONDAY
    )
  );
}

const datesOf = (state: ProgramState) =>
  (state.runDays ?? []).map((run) => run.date);

describe("a race plan made after its week's last run day (Run19)", () => {
  it("starts on next week's runs", () => {
    expect(datesOf(madeOn(SUNDAY))).toEqual([
      "2026-05-19",
      "2026-05-20",
      "2026-05-23",
    ]);
  });

  it("keeps planning runs, made on any day of the week", () => {
    for (let made = 0; made < 7; made++) {
      let state = madeOn(shift(MONDAY, made));
      expect(datesOf(state).length).toBeGreaterThan(0);
      // Four Mondays on, every week the rollover reaches holds its runs.
      for (let week = 1; week <= 4; week++) {
        const monday = shift(MONDAY, week * 7);
        state = onDay(
          monday,
          () => rollRunWeeks(state, profile, monday, "none", null).state
        );
        expect(
          state.runDays?.map((run) => run.weekKey),
          `made on day ${made}, week ${week}`
        ).toEqual([monday, monday, monday]);
      }
    }
  });

  it("is rebuilt on its next load when it was saved with an empty week", () => {
    // How such a plan was saved before: its week with no runs.
    const saved = { ...madeOn(SUNDAY), runDays: [] };
    expect(raceWeekNeedsBuilding(saved, profile, SUNDAY)).toBe(true);
    const rebuilt = (today: string) =>
      onDay(today, () =>
        regenerateRacePlan({
          profile,
          raceGoal: RACE,
          recentLayoff: "none",
          recentRuns: null,
          weekSchedule: TUE_WED_SAT_RUNS,
          weeklyRunDays: 3,
          currentDate: today,
          weekStart: MONDAY,
          plannedFrom: today,
          prior: { runDays: [] },
        }).runDays.map((run) => run.date)
      );
    // The same Sunday: next week's runs, as a plan made that day has them.
    expect(rebuilt(SUNDAY)).toEqual(datesOf(madeOn(SUNDAY)));
    // A load later in the week it was saved in plans that week from today.
    expect(rebuilt(shift(MONDAY, 2))).toEqual(["2026-05-13", "2026-05-16"]);
  });

  it("is a race week next week's rollover starts from", () => {
    const state = madeOn(SUNDAY);
    // On the Monday its runs are in, nothing is behind.
    const monday = onDay(NEXT_MONDAY, () =>
      rollRunWeeks(state, profile, NEXT_MONDAY, "none", null)
    );
    expect(monday.weeks).toBe(0);
    expect(datesOf(monday.state)).toEqual(datesOf(state));
  });
});

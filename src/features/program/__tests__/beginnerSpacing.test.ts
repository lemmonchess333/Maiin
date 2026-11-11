import { describe, expect, it } from "vitest";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { generateRacePlanV2, scheduleStarterWeek } from "../runScheduler";
import { newRunnerUntil } from "../newRunner";
import { nextStarterStage, starterRunSlots } from "../starterPlan";

const start = "2026-09-07";
const schedule = (mask: number): ScheduleDay[] =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    type: mask & (1 << day) ? "run" : "rest",
  }));
const spaced = (days: number[]) =>
  days.every((day) => !days.includes((day + 1) % 7));

describe("beginner prescribed running spacing", () => {
  it("uses at most three nonconsecutive available days for all 128 weekly calendars", () => {
    for (let mask = 0; mask < 128; mask++) {
      const input = schedule(mask);
      const original = structuredClone(input);
      const slots = starterRunSlots(input);
      expect(slots.length, `mask ${mask}`).toBeLessThanOrEqual(3);
      expect(spaced(slots), `mask ${mask}`).toBe(true);
      expect(slots.every((day) => (mask & (1 << day)) !== 0)).toBe(true);
      expect(
        scheduleStarterWeek({
          weekSchedule: input,
          weekStart: start,
          stage: 1,
        }).map((d) => d.dayIndex)
      ).toEqual(slots);
      expect(input).toEqual(original);
    }
  });

  it("reduces adjacent selections rather than adding unavailable days", () => {
    expect(starterRunSlots(schedule(14))).toEqual([1, 3]); // Mon/Tue/Wed
    expect(starterRunSlots(schedule(11))).toEqual([3, 0]); // Sun/Mon/Wed
    expect(starterRunSlots(schedule(42))).toEqual([1, 3, 5]);
    expect(starterRunSlots(schedule(6))).toHaveLength(1); // Mon/Tue only
  });

  it("applies the constraint to every beginner race distance, not established runners", () => {
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      const input = {
        weekSchedule: schedule(126),
        weeklyRunDays: 6,
        raceGoal: { distance, targetDate: "2027-01-31" },
        currentDate: start,
        weekStart: start,
        recentLayoff: "none" as const,
      };
      const novice = generateRacePlanV2({
        ...input,
        newRunnerUntil: newRunnerUntil("new", start),
      });
      const experienced = generateRacePlanV2(input);
      for (const week of novice.weeks.slice(0, 6)) {
        expect(week.length).toBeLessThanOrEqual(3);
        expect(spaced(week.map((d) => d.dayIndex))).toBe(true);
        expect(week.every((d) => d.templateId?.startsWith("run_walk_"))).toBe(
          true
        );
      }
      expect(experienced.weeks[0]).toHaveLength(6);
      expect(novice.weeks.every((week) => week.length <= 3)).toBe(true);
      const regenerated = generateRacePlanV2({
        ...input,
        currentDate: "2026-10-19",
        weekStart: "2026-10-19",
        planTotalWeeks: novice.totalWeeks,
        newRunnerUntil: newRunnerUntil("new", start),
      });
      expect(regenerated.weeks[0].length).toBeLessThanOrEqual(3);
    }
  });

  it("keeps beginner race events visible without a shakeout the day before or more than three exposures", () => {
    for (let offset = 0; offset < 7; offset++) {
      const targetDate = localDateString(
        addLocalDays(parseLocalDate(start), 7 + offset)
      );
      const result = generateRacePlanV2({
        weekSchedule: schedule(127),
        weeklyRunDays: 7,
        raceGoal: { distance: "5k", targetDate },
        currentDate: start,
        weekStart: start,
        recentLayoff: "none",
        newRunnerUntil: newRunnerUntil("new", start),
      });
      const raceWeek = result.weeks.at(-1)!;
      expect(
        raceWeek.filter((d) => d.type === "race").map((d) => d.date)
      ).toEqual([targetDate]);
      expect(raceWeek.length).toBeLessThanOrEqual(3);
      expect(
        raceWeek.some(
          (d) =>
            d.date ===
            localDateString(addLocalDays(parseLocalDate(targetDate), -1))
        )
      ).toBe(false);
    }
  });
});

describe("starter duplicate activity migration", () => {
  it("does not earn a stage from two records on one day, without mutating history", () => {
    const history = [start, start];
    expect(nextStarterStage(4, start, history)).toEqual({
      finished: false,
      stage: 4,
    });
    expect(history).toEqual([start, start]);
    expect(nextStarterStage(4, start, [...history, "2026-09-09"])).toEqual({
      finished: false,
      stage: 5,
    });
  });
});

import { nextRunWeek } from "../weekRollover";
import { starterProgress } from "../starterProgress";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "../programTypes";

it("a one-day starter earns the next stage over two weeks without reusing prior-stage runs", () => {
  const profile = {
    runMode: "starter",
    weekSchedule: schedule(2),
    starterGoal: { startedOn: start },
  } as UserProfile;
  const current = {
    runPlan: { mode: "starter", stage: 1, stageWeekKey: start },
    runDays: [],
  } as unknown as ProgramState;
  const firstRun = { date: start, distance: 1000, duration: 1200 };
  const held = nextRunWeek(
    current,
    { weekStart: "2026-09-14", date: "2026-09-14" },
    profile,
    "none",
    [firstRun]
  );
  expect(held.runPlan).toMatchObject({ stage: 1, stageStartedWeek: start });
  const secondRun = { ...firstRun, date: "2026-09-14" };
  const view = starterProgress(held, profile.starterGoal, [
    start,
    secondRun.date,
  ]);
  expect(view).toMatchObject({ runsThisWeek: 1, runsThisStage: 2 });
  const advanced = nextRunWeek(
    { ...current, ...held },
    { weekStart: "2026-09-21", date: "2026-09-21" },
    profile,
    "none",
    [firstRun, secondRun]
  );
  expect(advanced.runPlan?.stage).toBe(2);
  expect(advanced.runPlan?.stageStartedWeek).toBeUndefined();
  const noReuse = nextRunWeek(
    { ...current, ...advanced },
    { weekStart: "2026-09-28", date: "2026-09-28" },
    profile,
    "none",
    [firstRun, secondRun]
  );
  expect(noReuse.runPlan?.stage).toBe(2);
});

it("does not reuse stale stage credits after a long absence or advance on unreadable history", () => {
  expect(
    nextStarterStage(4, "2026-10-12", [start, "2026-10-12"], start)
  ).toEqual({ finished: false, stage: 4 });
  expect(nextStarterStage(4, "2026-10-12", null, start)).toEqual({
    finished: false,
    stage: 4,
  });
});

it("simulates all availability calendars across all four beginner race distances and every race weekday", () => {
  for (const distance of ["5k", "10k", "half", "marathon"] as const) {
    for (let mask = 0; mask < 128; mask++) {
      for (let weekday = 0; weekday < 7; weekday++) {
        const targetDate = localDateString(
          addLocalDays(parseLocalDate(start), 49 + weekday)
        );
        const result = generateRacePlanV2({
          weekSchedule: schedule(mask),
          weeklyRunDays: 7,
          raceGoal: { distance, targetDate },
          currentDate: start,
          weekStart: start,
          recentLayoff: "none",
          newRunnerUntil: newRunnerUntil("new", start),
        });
        expect(result.weeks.every((week) => week.length <= 3)).toBe(true);
        const dates = result.weeks
          .flat()
          .map((day) => day.date!)
          .sort();
        for (let i = 1; i < dates.length; i++) {
          expect(
            dates[i],
            `${distance} mask ${mask}, race ${targetDate}`
          ).not.toBe(
            localDateString(addLocalDays(parseLocalDate(dates[i - 1]), 1))
          );
        }
      }
    }
  }
}, 30_000);

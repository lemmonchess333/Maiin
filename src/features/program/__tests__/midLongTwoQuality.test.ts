/**
 * "Harder" on six days (deep dive D16). A week with two quality sessions has
 * no day clear of them and the long run, so the medium-long run went where
 * the fill order put it: 6 x 1 km on Monday, 90 minutes on Tuesday, a
 * 40-minute tempo on Wednesday. Such a week now holds the medium-long under
 * the hour (Run20 counts an hour or more as demanding); a week with one
 * quality session, or a clear day, keeps it.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import type { ScheduledRunDay } from "../programTypes";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** Monday 9 March 2026; the marathon on the Sunday of week 18. */
const START = "2026-03-09";
const RACE = localDateString(addLocalDays(parseLocalDate(START), 17 * 7 + 6));
const runOn = (days: number[]): ScheduleDay[] =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    type: days.includes(day) ? "run" : "rest",
  })) as ScheduleDay[];

function weeks(days: number[], tuning?: RacePlanV2Input["tuning"]) {
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: runOn(days),
    weeklyRunDays: days.length,
    raceGoal: { distance: "marathon", targetDate: RACE },
    currentDate: START,
    weekStart: START,
    easyPaceSPerKm: 323,
    tuning,
  }).weeks;
}

const minutes = (run: ScheduledRunDay) =>
  RUN_TEMPLATES.find((t) => t.id === run.templateId)?.estimatedDuration ?? 0;
const isQuality = (run: ScheduledRunDay) =>
  run.type === "tempo" || run.type === "intervals";
/** Days apart in the week, Sunday beside Monday. */
const apart = (a: number, b: number) =>
  Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

describe("a harder marathon plan on six days", () => {
  const plan = weeks([1, 2, 3, 4, 5, 6], {
    volume: "bigger",
    difficulty: "harder",
  });
  const twoQuality = plan.filter((week) => week.filter(isQuality).length === 2);

  it("has weeks with two quality sessions to hold", () => {
    expect(twoQuality.length).toBeGreaterThan(3);
  });

  it("puts no hour-long easy run beside a quality session or the long run", () => {
    for (const week of twoQuality) {
      const demanding = week.filter(
        (run) => isQuality(run) || run.type === "long"
      );
      for (const run of week.filter((r) => r.type === "easy"))
        if (demanding.some((d) => apart(d.dayIndex, run.dayIndex) <= 1))
          expect(minutes(run)).toBeLessThan(60);
    }
  });

  it("keeps every run, the medium-long held at 50 minutes, not dropped", () => {
    for (const week of twoQuality) expect(week).toHaveLength(6);
    // The weeks whose medium-long was over the hour hold a 50.
    expect(
      twoQuality.filter((week) =>
        week.some((run) => run.templateId === "easy_50")
      ).length
    ).toBeGreaterThan(3);
  });
});

describe("what it leaves as it was", () => {
  it("a week with one quality session keeps its hour-plus medium-long", () => {
    const plan = weeks([1, 2, 3, 4, 5, 6]);
    expect(
      plan.some(
        (week) =>
          week.filter(isQuality).length === 1 &&
          week.some((run) => run.type === "easy" && minutes(run) >= 60)
      )
    ).toBe(true);
  });
});

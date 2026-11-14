/**
 * Coming back to a race plan after a layoff (Run15 STATUS 2026-11-12, deep
 * dive D11). A half-marathon runner trained five weeks, ran nothing for
 * three, and came back to the full base week: three 30-minute runs and the
 * base 10 km long run, 158 minutes against the 179 of the last week they
 * trained, then the same 10 km for three weeks while the race got no closer
 * to reach. Now the week back is a rung under base with 20-minute easy runs,
 * about 60% of the last week trained, and each week after climbs one rung
 * and ten minutes, never past the ramp's own.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2, DEFAULT_RUN_TUNING } from "../runScheduler";
import { returnWeekKey, type DatedRun } from "../layoffDetection";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** Monday 9 March 2026, the plan's first week; the half on Sunday 14 June. */
const START = "2026-03-09";
const RACE = { distance: "half" as const, targetDate: "2026-06-14" };
const day = (offset: number) =>
  localDateString(addLocalDays(parseLocalDate(START), offset));

/** A run as the read returns it: a date and enough to count. */
const run = (date: string, km: number): DatedRun =>
  ({ date, distance: km * 1000, duration: km * 400 }) as DatedRun;

/** Weeks 1 to 5 trained, four runs a week; weeks 6 to 8 nothing. */
const TRAINED = [0, 1, 2, 3, 4].flatMap((w) =>
  [0, 2, 4, 6].map((d) => run(day(w * 7 + d), d === 6 ? 10 : 4.5))
);

/** The run plan's week starting `monday`, as the rollover builds it. */
function weekOf(monday: string, runs: readonly DatedRun[], layoff: string) {
  return generateRacePlanV2({
    raceGoal: RACE,
    weekSchedule: generateSchedule(2, 4),
    weeklyRunDays: 4,
    currentDate: monday,
    weekStart: localWeekKey(parseLocalDate(monday)),
    tuning: DEFAULT_RUN_TUNING,
    recentLayoff: layoff as "detrained",
    planTotalWeeks: 14,
    recentRuns: runs,
    recentRunsAsOf: monday,
  }).weeks[0];
}
const long = (week: { templateId: string }[]) =>
  week.find((r) => r.templateId.startsWith("long_"))?.templateId;
const easies = (week: { templateId: string }[]) =>
  week.filter((r) => r.templateId.startsWith("easy_")).map((r) => r.templateId);

describe("the week a runner came back in", () => {
  it("is the week of their first run after the gap", () => {
    const back = [...TRAINED, run(day(56), 4)];
    expect(returnWeekKey(back, day(60))).toBe(day(56));
  });

  it("is this week while they are still away", () => {
    expect(returnWeekKey(TRAINED, day(56))).toBe(day(56));
  });

  it("is none for someone who never stopped, or never ran", () => {
    expect(returnWeekKey(TRAINED, day(35))).toBeNull();
    expect(returnWeekKey([], day(35))).toBeNull();
  });
});

describe("a half-marathon plan after three weeks off", () => {
  it("opens a rung under the base long run, with 20-minute easy runs", () => {
    const week = weekOf(day(56), TRAINED, "detrained");
    expect(long(week)).toBe("long_8k");
    expect(easies(week).every((id) => id === "easy_20")).toBe(true);
  });

  it("climbs a rung a week after it", () => {
    const back = [
      ...TRAINED,
      ...[56, 58, 60, 62].map((d) => run(day(d), d === 62 ? 8 : 3)),
    ];
    const second = weekOf(day(63), back, "detrained");
    expect(long(second)).toBe("long_10k");
    expect(easies(second).every((id) => id === "easy_30")).toBe(true);
    const more = [
      ...back,
      ...[63, 65, 67, 69].map((d) => run(day(d), d === 69 ? 10 : 4.5)),
    ];
    expect(long(weekOf(day(70), more, "detrained"))).toBe("long_12k");
  });

  it("is the full base week without the runs to see the gap in", () => {
    // No runs read: a detrained runner ramps toward base, as before.
    const week = generateRacePlanV2({
      raceGoal: RACE,
      weekSchedule: generateSchedule(2, 4),
      weeklyRunDays: 4,
      currentDate: day(56),
      weekStart: day(56),
      tuning: DEFAULT_RUN_TUNING,
      recentLayoff: "detrained",
      planTotalWeeks: 14,
    }).weeks[0];
    expect(long(week)).toBe("long_10k");
  });

  it("leaves a runner who kept running on the plan's own week", () => {
    const steady = [
      ...TRAINED,
      ...[5, 6, 7].flatMap((w) =>
        [0, 2, 4, 6].map((d) => run(day(w * 7 + d), d === 6 ? 12 : 5))
      ),
    ];
    const withRuns = weekOf(day(56), steady, "none");
    const without = generateRacePlanV2({
      raceGoal: RACE,
      weekSchedule: generateSchedule(2, 4),
      weeklyRunDays: 4,
      currentDate: day(56),
      weekStart: day(56),
      tuning: DEFAULT_RUN_TUNING,
      recentLayoff: "none",
      planTotalWeeks: 14,
    }).weeks[0];
    expect(long(withRuns)).toBe(long(without));
  });
});

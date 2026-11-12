/**
 * The weeks after a race, by its distance (training deep dive, D10). PR-E
 * put an easy 30 on every run day from the day after, for up to four weeks:
 * a marathoner ran the Monday after a Sunday marathon, six days that week,
 * and the same every week until the recovery ended. Now a recovery starts
 * with days off, then two or three short runs, then 30 minutes, then 40.
 */
import { describe, expect, it } from "vitest";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { scheduleRecoveryWeekV2 } from "../runScheduler";

/** Runs Monday to Friday and Sunday (day 0 is Sunday), as runner G's. */
const SIX_DAYS: ScheduleDay[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  type: day === 6 ? "rest" : "run",
})) as ScheduleDay[];

/** Sunday 6 September 2026. */
const RACE_DAY = "2026-09-06";
const weekOf = (weekStart: string, distance: string) =>
  scheduleRecoveryWeekV2({
    weekSchedule: SIX_DAYS,
    weekStart,
    race: { distance, targetDate: RACE_DAY },
  }).map((run) => `${run.date} ${run.templateId}`);

describe("after a marathon", () => {
  it("runs nothing in the week after it", () => {
    expect(weekOf("2026-09-07", "marathon")).toEqual([]);
  });

  it("then runs two or three short runs, on days apart", () => {
    expect(weekOf("2026-09-14", "marathon")).toEqual([
      "2026-09-14 easy_20",
      "2026-09-16 easy_20",
      "2026-09-18 easy_20",
      "2026-09-20 easy_30",
    ]);
  });

  it("then 30 minutes on every run day, then 40", () => {
    expect(weekOf("2026-09-21", "marathon")).toEqual([
      "2026-09-21 easy_30",
      "2026-09-22 easy_30",
      "2026-09-23 easy_30",
      "2026-09-24 easy_30",
      "2026-09-25 easy_30",
      "2026-09-27 easy_40",
    ]);
    expect(
      weekOf("2026-09-28", "marathon").every((run) => run.endsWith("easy_40"))
    ).toBe(true);
  });
});

describe("after a shorter race", () => {
  it("rests one day after a 5K and never reaches 40 minutes", () => {
    expect(weekOf("2026-09-07", "5k")).toEqual([
      "2026-09-08 easy_20",
      "2026-09-10 easy_30",
      "2026-09-11 easy_30",
      "2026-09-13 easy_30",
    ]);
  });

  it("rests two days after a 10K", () => {
    expect(weekOf("2026-09-07", "10k")[0]).toBe("2026-09-09 easy_20");
    expect(
      weekOf("2026-09-14", "10k").every((run) => run.endsWith("easy_30"))
    ).toBe(true);
  });

  it("rests four days after a half", () => {
    expect(weekOf("2026-09-07", "half")[0]).toBe("2026-09-11 easy_20");
  });
});

describe("a recovery with no race to grade it by", () => {
  it("keeps an easy 30 on every run day, as before", () => {
    const week = scheduleRecoveryWeekV2({
      weekSchedule: SIX_DAYS,
      weekStart: "2026-09-07",
    });
    expect(week).toHaveLength(6);
    expect(week.every((run) => run.templateId === "easy_30")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { chooseQualityRunSlots } from "../runPlacement";
import { generateRacePlanV2 } from "../runScheduler";
import type { ScheduleDay } from "@/lib/scheduleUtils";

const schedule = (days: number[], both: number[] = []): ScheduleDay[] =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    type: both.includes(day) ? "both" : days.includes(day) ? "run" : "rest",
  }));
const adjacent = (a: number, b: number) =>
  Math.abs(a - b) === 1 || Math.abs(a - b) === 6;

describe("quality placement within the actual available week", () => {
  it("uses Tuesday and Thursday between Sunday long runs", () => {
    expect(
      chooseQualityRunSlots({
        availableDays: [1, 2, 4],
        longDay: 0,
        count: 2,
        weekSchedule: schedule([0, 1, 2, 4]),
      })
    ).toEqual([2, 4]);
  });

  it("the real harder race plan uses those slots and retains an easy run", () => {
    const plan = generateRacePlanV2({
      weekSchedule: schedule([0, 1, 2, 4]),
      raceGoal: { distance: "half", targetDate: "2027-01-03" },
      weeklyRunDays: 4,
      currentDate: "2026-09-07",
      weekStart: "2026-09-07",
      recentLayoff: "none",
      tuning: { difficulty: "harder", volume: "standard" },
    });
    const build = plan.weeks.find(
      (week) =>
        week.filter((d) => d.type === "tempo" || d.type === "intervals")
          .length === 2
    );
    expect(build).toBeDefined();
    expect(
      build?.map((d) => [
        d.dayIndex,
        d.type === "tempo" || d.type === "intervals" ? "quality" : d.type,
      ])
    ).toEqual([
      [1, "easy"],
      [2, "quality"],
      [4, "quality"],
      [0, "long"],
    ]);
  });

  it("avoids consecutive demanding days whenever a feasible pair exists", () => {
    for (let longDay = 0; longDay < 7; longDay++) {
      for (let mask = 1; mask < 128; mask++) {
        const days = Array.from({ length: 7 }, (_, d) => d).filter(
          (d) => mask & (1 << d) && d !== longDay
        );
        if (days.length < 2) continue;
        const feasible = days.some((a) =>
          days.some(
            (b) =>
              a !== b &&
              !adjacent(a, b) &&
              !adjacent(a, longDay) &&
              !adjacent(b, longDay)
          )
        );
        const chosen = chooseQualityRunSlots({
          availableDays: days,
          longDay,
          count: 2,
          weekSchedule: schedule([...days, longDay]),
        });
        expect(new Set(chosen).size).toBe(2);
        expect(chosen.every((d) => days.includes(d))).toBe(true);
        if (feasible) {
          expect(adjacent(chosen[0], chosen[1])).toBe(false);
          expect(chosen.some((d) => adjacent(d, longDay))).toBe(false);
        }
      }
    }
  });

  it("prefers a run-only day when spacing ties, regardless of input order", () => {
    const input = {
      availableDays: [4, 2],
      longDay: 0,
      count: 1 as const,
      weekSchedule: schedule([0, 2, 4], [4]),
    };
    expect(chooseQualityRunSlots(input)).toEqual([2]);
    expect(chooseQualityRunSlots({ ...input, availableDays: [2, 4] })).toEqual([
      2,
    ]);
  });

  it("retains the requested work when no spaced placement is possible", () => {
    expect(
      chooseQualityRunSlots({
        availableDays: [1, 2],
        longDay: 0,
        count: 2,
        weekSchedule: schedule([0, 1, 2]),
      })
    ).toEqual([1, 2]);
  });
});

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

  /* RUN-EV-10: the taper's session went on the first free day of the week
     (`remaining[0]`), so after a Sunday long run it landed on the Monday,
     on a lift day or not. It goes through the same placement as every
     quality session. */
  describe("the taper's session", () => {
    const taperSessions = (both: number[] = []) => {
      const plan = generateRacePlanV2({
        weekSchedule: schedule([0, 1, 3, 5], both),
        raceGoal: { distance: "half", targetDate: "2027-01-03" },
        weeklyRunDays: 4,
        currentDate: "2026-09-07",
        weekStart: "2026-09-07",
        recentLayoff: "none",
        tuning: { difficulty: "standard", volume: "standard" },
      });
      return plan.weeks.flat().filter((d) => d.templateId === "8x400");
    };

    it("isn't the day after the weekend's long-run slot", () => {
      const sessions = taperSessions();
      expect(sessions.length).toBeGreaterThan(0);
      for (const d of sessions) expect(adjacent(d.dayIndex, 0)).toBe(false);
    });

    it("isn't on a lifting day when a running-only day is free", () => {
      const sessions = taperSessions([3]);
      expect(sessions.length).toBeGreaterThan(0);
      for (const d of sessions) expect(d.dayIndex).toBe(5);
    });
  });

  /* Run20 (3): a run of an hour or more is demanding. The medium-long run
     took the week's first easy day, so in every 4-day marathon build week
     it sat the day before the quality session, and in base weeks the day
     after the Sunday long run (running-engine-audit §7 item 3). */
  describe("the medium-long run", () => {
    const MEDIUM_LONG = new Set(["easy_60", "easy_75", "easy_90"]);
    const weeksFor = (days: number[]) =>
      generateRacePlanV2({
        weekSchedule: schedule(days),
        raceGoal: { distance: "marathon", targetDate: "2027-04-25" },
        weeklyRunDays: days.length,
        currentDate: "2026-09-07",
        weekStart: "2026-09-07",
        recentLayoff: "none",
        tuning: { difficulty: "standard", volume: "standard" },
      }).weeks;
    const demanding = (d: { type: string; templateId: string }) =>
      d.type === "long" ||
      d.type === "tempo" ||
      d.type === "intervals" ||
      d.type === "race";

    it("never falls the day before or after a long run or quality session when the week has room", () => {
      const weeks = weeksFor([0, 2, 3, 5]);
      let mediumLongs = 0;
      for (const week of weeks) {
        const ml = week.find((d) => MEDIUM_LONG.has(d.templateId));
        if (!ml) continue;
        mediumLongs++;
        for (const other of week.filter(demanding)) {
          expect(
            adjacent(ml.dayIndex, other.dayIndex),
            `${ml.templateId} on ${ml.dayIndex} beside ${other.templateId} on ${other.dayIndex}`
          ).toBe(false);
        }
      }
      expect(mediumLongs).toBeGreaterThan(5);
    });

    it("keeps the week's own days when every easy day is beside a demanding one", () => {
      // Sunday long, Monday and Tuesday easy, Wednesday quality: no easy
      // day is clear of a demanding one, so the plan keeps its first.
      const weeks = weeksFor([0, 1, 2, 3]);
      expect(
        weeks.some((week) => week.some((d) => MEDIUM_LONG.has(d.templateId)))
      ).toBe(true);
    });
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

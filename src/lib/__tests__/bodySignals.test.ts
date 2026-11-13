import { describe, it, expect } from "vitest";
import {
  dayKeyBefore,
  nightAsleepMinutes,
  todayAgainstUsual,
  usualSleepMinutes,
  type SleepSampleLike,
} from "../bodySignals";

/** A local wall-clock instant as the plugin returns it (an ISO string). */
function at(dayKey: string, hh: number, mm = 0): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

function asleep(
  fromDay: string,
  fromH: number,
  fromM: number,
  toDay: string,
  toH: number,
  toM: number,
  state = "asleep"
): SleepSampleLike {
  return {
    startDate: at(fromDay, fromH, fromM),
    endDate: at(toDay, toH, toM),
    sleepState: state,
  };
}

describe("nightAsleepMinutes", () => {
  it("counts the night that ends on the day, in minutes asleep", () => {
    const night = [asleep("2026-11-12", 23, 0, "2026-11-13", 6, 30)];
    expect(nightAsleepMinutes(night, "2026-11-13")).toBe(450);
  });

  it("counts a night recorded twice (Watch and phone) once", () => {
    const night = [
      asleep("2026-11-12", 23, 0, "2026-11-13", 6, 30),
      asleep("2026-11-12", 23, 30, "2026-11-13", 7, 0),
    ];
    expect(nightAsleepMinutes(night, "2026-11-13")).toBe(480);
  });

  it("adds the stages and leaves out in bed and awake", () => {
    const night = [
      asleep("2026-11-12", 22, 30, "2026-11-13", 7, 0, "inBed"),
      asleep("2026-11-12", 23, 0, "2026-11-13", 1, 0, "light"),
      asleep("2026-11-13", 1, 0, "2026-11-13", 1, 20, "awake"),
      asleep("2026-11-13", 1, 20, "2026-11-13", 3, 0, "deep"),
      asleep("2026-11-13", 3, 0, "2026-11-13", 6, 0, "rem"),
    ];
    expect(nightAsleepMinutes(night, "2026-11-13")).toBe(120 + 100 + 180);
  });

  it("an afternoon nap is not last night", () => {
    const nap = [asleep("2026-11-13", 15, 0, "2026-11-13", 16, 0)];
    expect(nightAsleepMinutes(nap, "2026-11-13")).toBeNull();
    // It is the next day's night only if it ends after 18:00 the evening
    // before that next day: it does not.
    expect(nightAsleepMinutes(nap, "2026-11-14")).toBeNull();
  });

  it("no record is null, not a night without sleep", () => {
    expect(nightAsleepMinutes([], "2026-11-13")).toBeNull();
  });

  it("a sample with no stage counts as asleep (HealthKit's older value)", () => {
    const night = [
      {
        startDate: at("2026-11-12", 23, 0),
        endDate: at("2026-11-13", 7, 0),
      },
    ];
    expect(nightAsleepMinutes(night, "2026-11-13")).toBe(480);
  });
});

describe("usualSleepMinutes", () => {
  function nights(today: string, minutesEach: number[]): SleepSampleLike[] {
    return minutesEach.map((minutes, i) => {
      const wake = dayKeyBefore(today, i + 1);
      const end = at(wake, 7, 0);
      return {
        startDate: new Date(Date.parse(end) - minutes * 60000).toISOString(),
        endDate: end,
        sleepState: "asleep",
      };
    });
  }

  it("is the median of the earlier nights, not tonight's", () => {
    const samples = nights("2026-11-13", [420, 430, 440, 450, 460, 470, 480]);
    expect(usualSleepMinutes(samples, "2026-11-13")).toBe(450);
  });

  it("one all-nighter does not move it", () => {
    const samples = nights("2026-11-13", [30, 450, 450, 450, 450, 450, 450]);
    expect(usualSleepMinutes(samples, "2026-11-13")).toBe(450);
  });

  it("needs seven nights before there is a usual", () => {
    const samples = nights("2026-11-13", [450, 450, 450, 450, 450, 450]);
    expect(usualSleepMinutes(samples, "2026-11-13")).toBeNull();
  });
});

describe("todayAgainstUsual", () => {
  const today = "2026-11-13";
  const week = Array.from({ length: 7 }, (_, i) => ({
    dateKey: dayKeyBefore(today, i + 1),
    value: 54,
  }));

  it("reads today's value against the earlier days' median", () => {
    expect(
      todayAgainstUsual([...week, { dateKey: today, value: 60 }], today)
    ).toEqual({ today: 60, usual: 54 });
  });

  it("has no usual under seven earlier days, and no today without a reading", () => {
    expect(todayAgainstUsual(week.slice(1), today)).toEqual({
      today: null,
      usual: null,
    });
  });

  it("leaves out days older than four weeks", () => {
    const old = Array.from({ length: 7 }, (_, i) => ({
      dateKey: dayKeyBefore(today, 40 + i),
      value: 70,
    }));
    expect(todayAgainstUsual(old, today).usual).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { rollingWindowStart, localDateString } from "@/lib/dateHelpers";

/**
 * `days` has to mean `days`.
 *
 * Every consumer of this helper derived the boundary by hand as
 * `today - days`, which opens a window of `days + 1` dates. One of them
 * also kept the current time of day on the boundary, which excluded that
 * date instead — so Analytics read a single range pill as two windows at
 * once (#2358).
 */

/** Every date from the window's start through today, inclusive. */
function windowDates(days: number, today: Date): string[] {
  const start = rollingWindowStart(days, today);
  const out: string[] = [];
  for (
    const d = new Date(start);
    localDateString(d) <= localDateString(today);
    d.setDate(d.getDate() + 1)
  )
    out.push(localDateString(d));
  return out;
}

const WEDNESDAY = new Date(2026, 8, 16, 14, 30, 0);

describe("rollingWindowStart", () => {
  it.each([
    [7, 7],
    [30, 30],
    [90, 90],
    [180, 180],
    [365, 365],
  ])("a %i-day window holds %i dates", (days, expected) => {
    expect(windowDates(days, WEDNESDAY)).toHaveLength(expected);
  });

  it("ends on today and starts days-1 back", () => {
    const dates = windowDates(7, WEDNESDAY);
    expect(dates[dates.length - 1]).toBe("2026-09-16");
    expect(dates[0]).toBe("2026-09-10");
  });

  it("is local midnight, not the caller's time of day", () => {
    /* The nutrition memo's version kept `new Date()`'s clock on the
       boundary and compared it against each meal's local midnight, so
       the boundary date fell outside the window it was supposed to open.
       Two calls an hour apart must give the same instant. */
    const morning = rollingWindowStart(7, new Date(2026, 8, 16, 6, 5, 0));
    const evening = rollingWindowStart(7, new Date(2026, 8, 16, 23, 55, 0));
    expect(morning.getTime()).toBe(evening.getTime());
    expect(morning.getHours()).toBe(0);
    expect(morning.getMinutes()).toBe(0);
    expect(morning.getSeconds()).toBe(0);
    expect(morning.getMilliseconds()).toBe(0);
  });

  it("a one-day window is today alone", () => {
    expect(windowDates(1, WEDNESDAY)).toEqual(["2026-09-16"]);
  });

  it("crosses a month boundary by date, not by arithmetic on the day number", () => {
    expect(
      localDateString(rollingWindowStart(7, new Date(2026, 8, 3, 9, 0)))
    ).toBe("2026-08-28");
  });

  it("crosses a year boundary", () => {
    expect(
      localDateString(rollingWindowStart(30, new Date(2026, 0, 5, 9, 0)))
    ).toBe("2025-12-07");
  });

  it("is NOT the old hand-rolled boundary", () => {
    /* The regression this exists to stop. `today - days` reads as a
       days-long window and opens a days+1 one. */
    const handRolled = new Date(WEDNESDAY);
    handRolled.setDate(handRolled.getDate() - 7);
    expect(localDateString(rollingWindowStart(7, WEDNESDAY))).not.toBe(
      localDateString(handRolled)
    );
  });
});

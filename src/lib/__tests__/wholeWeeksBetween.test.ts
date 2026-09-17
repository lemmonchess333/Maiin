/**
 * `wholeWeeksBetween` across a DST boundary — the arithmetic behind the
 * "Training for … · N wks" chip, its only caller today.
 *
 * The chip divided the raw millisecond span by a week and floored it.
 * A spring-forward inside the span makes that span an hour SHORT, so
 * every exact multiple of seven days crossing the transition lost a
 * whole week — and a race is an exact multiple of seven days away one
 * day in every seven, so for any race in that window the chip was wrong
 * weekly, not once.
 *
 * These run in Europe/London deliberately. Node re-reads `process.env.TZ`
 * per Date construction, so the transition is exercised for real; in the
 * CI runner's UTC there is no transition and every case here passes
 * against the broken arithmetic too. That is the whole reason it shipped.
 */
import { describe, it, expect, afterEach } from "vitest";
import { wholeWeeksBetween } from "../dateHelpers";

const original = process.env.TZ;
afterEach(() => {
  process.env.TZ = original;
});

describe("wholeWeeksBetween", () => {
  it("counts whole weeks, and reads 0 inside race week", () => {
    process.env.TZ = "UTC";
    expect(wholeWeeksBetween("2027-05-01", "2027-05-01")).toBe(0);
    expect(wholeWeeksBetween("2027-05-01", "2027-05-07")).toBe(0);
    expect(wholeWeeksBetween("2027-05-01", "2027-05-08")).toBe(1);
    expect(wholeWeeksBetween("2027-05-01", "2027-05-14")).toBe(1);
    expect(wholeWeeksBetween("2027-05-01", "2027-05-15")).toBe(2);
  });

  it("does not lose a week to the spring-forward", () => {
    process.env.TZ = "Europe/London"; // clocks go forward 2027-03-28
    // Each of these is an exact multiple of seven CALENDAR days whose
    // span contains the transition, so each is an hour short of a round
    // number of 24-hour periods.
    expect(wholeWeeksBetween("2027-03-20", "2027-04-03")).toBe(2); // 14 days
    expect(wholeWeeksBetween("2027-03-20", "2027-04-10")).toBe(3); // 21 days
    expect(wholeWeeksBetween("2027-03-20", "2027-04-17")).toBe(4); // 28 days
    // …and the day before each boundary still reads one fewer, so the
    // rounding has not simply shifted the error up by a day.
    expect(wholeWeeksBetween("2027-03-20", "2027-04-02")).toBe(1); // 13 days
    expect(wholeWeeksBetween("2027-03-20", "2027-04-09")).toBe(2); // 20 days
  });

  it("does not gain a week from the autumn extra hour", () => {
    process.env.TZ = "Europe/London"; // clocks go back 2027-10-31
    expect(wholeWeeksBetween("2027-10-24", "2027-11-07")).toBe(2); // 14 days
    expect(wholeWeeksBetween("2027-10-24", "2027-11-06")).toBe(1); // 13 days
  });

  it("a race in the southern-hemisphere transition behaves the same", () => {
    process.env.TZ = "Pacific/Auckland"; // forward 2027-09-26
    expect(wholeWeeksBetween("2027-09-18", "2027-10-02")).toBe(2);
    expect(wholeWeeksBetween("2027-09-18", "2027-10-09")).toBe(3);
  });

  it("an unparseable key is 0 rather than NaN weeks", () => {
    process.env.TZ = "UTC";
    expect(wholeWeeksBetween("not-a-date", "2027-05-08")).toBe(0);
  });
});

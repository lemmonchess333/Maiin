import { describe, it, expect } from "vitest";
import {
  CALORIE_TARGET_BAND,
  foodDaysReading,
  type DayTarget,
} from "../foodDays";
import { addLocalDays, localDateString } from "../dateHelpers";

/* A fixed Monday handed in as keys; nothing reads the clock. Counting
   back: 1 is Sunday, 2 Saturday, 3 to 7 Friday to Monday. */
const TODAY = new Date(2026, 8, 28);
const day = (n: number) => localDateString(addLocalDays(TODAY, -n));
const SPAN = { sinceKey: day(29), todayKey: day(0) };

const meal = (n: number, totalCalories: number, totalProtein = 0) => ({
  date: day(n),
  totalCalories,
  totalProtein,
});
const target = (calories: number, protein = 150): DayTarget => ({
  calories,
  protein,
});

describe("foodDaysReading", () => {
  it("judges each day against the target it had that day", () => {
    const targets = new Map([
      [day(3), target(2600)], // a lift day
      [day(4), target(2200)], // a rest day
    ]);
    // 2,400 is on target for neither day: 7.7% under one, 9.1% over the other.
    const reading = foodDaysReading({
      meals: [meal(3, 2400), meal(4, 2400)],
      targets,
      ...SPAN,
    });
    expect(CALORIE_TARGET_BAND).toBe(0.1);
    expect(reading.calories).toEqual({ onTarget: 2, judged: 2 });
    const off = foodDaysReading({
      meals: [meal(3, 2300), meal(4, 2450)],
      targets,
      ...SPAN,
    });
    // 2,300 is 11.5% under 2,600; 2,450 is 11.4% over 2,200.
    expect(off.calories).toEqual({ onTarget: 0, judged: 2 });
  });

  it("adds a day's meals together before judging it", () => {
    const reading = foodDaysReading({
      meals: [meal(3, 1200, 70), meal(3, 1100, 90)],
      targets: new Map([[day(3), target(2300, 150)]]),
      ...SPAN,
    });
    expect(reading.calories).toEqual({ onTarget: 1, judged: 1 });
    expect(reading.protein).toEqual({ met: 1, judged: 1 });
  });

  it("leaves out today, and days before the range", () => {
    const reading = foodDaysReading({
      meals: [meal(0, 900), meal(40, 2300), meal(3, 2300)],
      targets: new Map([
        [day(0), target(2300)],
        [day(40), target(2300)],
        [day(3), target(2300)],
      ]),
      ...SPAN,
    });
    expect(reading.calories.judged).toBe(1);
  });

  it("judges nothing against a day with no target", () => {
    const reading = foodDaysReading({
      meals: [meal(3, 2300), meal(4, 2300)],
      targets: new Map([[day(3), target(2300)]]),
      ...SPAN,
    });
    expect(reading.calories).toEqual({ onTarget: 1, judged: 1 });
  });

  it("counts protein met at or over the target", () => {
    const reading = foodDaysReading({
      meals: [meal(3, 2300, 150), meal(4, 2300, 149)],
      targets: new Map([
        [day(3), target(2300, 150)],
        [day(4), target(2300, 150)],
      ]),
      ...SPAN,
    });
    expect(reading.protein).toEqual({ met: 1, judged: 2 });
  });

  it("does not count a day logged as nothing", () => {
    const reading = foodDaysReading({
      meals: [meal(3, 0)],
      targets: new Map([[day(3), target(2300)]]),
      ...SPAN,
    });
    expect(reading.calories.judged).toBe(0);
  });

  describe("the weekend against the week", () => {
    const weekdays = [meal(3, 2000), meal(4, 2100), meal(5, 2200)];

    it("averages each when there are enough of both", () => {
      const reading = foodDaysReading({
        meals: [...weekdays, meal(1, 2800), meal(2, 3000)],
        targets: new Map(),
        ...SPAN,
      });
      expect(reading.weekendCalories).toBe(2900);
      expect(reading.weekdayCalories).toBe(2100);
    });

    it("compares nothing on a single weekend day", () => {
      const reading = foodDaysReading({
        meals: [...weekdays, meal(1, 2800)],
        targets: new Map(),
        ...SPAN,
      });
      expect(reading.weekendCalories).toBeNull();
      expect(reading.weekdayCalories).toBeNull();
    });
  });
});

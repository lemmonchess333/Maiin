import { describe, expect, it } from "vitest";
import { foodWeek, foodWeekStart } from "@/lib/foodWeek";
import type { DayTarget } from "@/lib/foodDays";

/* Every date here is an argument, never read from the clock: the model
   takes today as an input, so literal keys cannot drift out of a window. */

const NONE = new Set<string>();
const NO_SNAPSHOTS = new Map<string, DayTarget>();

function meal(id: string, date: string, totalCalories: number) {
  return { id, date, totalCalories };
}

function week(overrides: Partial<Parameters<typeof foodWeek>[0]> = {}) {
  return foodWeek({
    selectedKey: "2026-09-30",
    todayKey: "2026-09-30",
    minKey: "2026-07-02",
    meals: [],
    hiddenMealIds: NONE,
    snapshots: NO_SNAPSHOTS,
    selectedTarget: 2000,
    ...overrides,
  });
}

describe("foodWeek — which days", () => {
  it("is the Monday-to-Sunday week holding the day in view", () => {
    // 30 September 2026 is a Wednesday.
    expect(week().map((d) => d.key)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("starts on the day itself for a Monday, and six days back for a Sunday", () => {
    expect(foodWeekStart("2026-09-28")).toBe("2026-09-28");
    expect(foodWeekStart("2026-10-04")).toBe("2026-09-28");
    expect(foodWeekStart("2026-10-05")).toBe("2026-10-05");
  });

  it("follows the day in view, not today", () => {
    const days = week({ selectedKey: "2026-09-24" });
    expect(days[0].key).toBe("2026-09-21");
    expect(days.find((d) => d.isSelected)?.key).toBe("2026-09-24");
    expect(days.some((d) => d.isToday)).toBe(false);
  });

  it("keeps seven consecutive days across a clock change", () => {
    // Europe/London springs forward on 28 March 2027 and New Zealand
    // on 27 September 2026; both weeks must still be seven dates.
    for (const selectedKey of ["2027-03-25", "2026-09-24"]) {
      const keys = week({ selectedKey, todayKey: "2027-04-30" }).map(
        (d) => d.key
      );
      expect(new Set(keys).size).toBe(7);
      const start = new Date(keys[0] + "T12:00:00").getTime();
      const end = new Date(keys[6] + "T12:00:00").getTime();
      expect(Math.round((end - start) / 86_400_000)).toBe(6);
    }
  });

  it("marks today and the day in view", () => {
    const days = week({ selectedKey: "2026-09-29" });
    expect(days.filter((d) => d.isToday).map((d) => d.key)).toEqual([
      "2026-09-30",
    ]);
    expect(days.filter((d) => d.isSelected).map((d) => d.key)).toEqual([
      "2026-09-29",
    ]);
  });

  it("opens days from the diary's oldest reach to today, and no others", () => {
    const days = week({
      selectedKey: "2026-09-30",
      minKey: "2026-09-29",
    });
    expect(days.map((d) => d.isSelectable)).toEqual([
      false, // before the diary's reach
      true,
      true, // today
      false, // after today
      false,
      false,
      false,
    ]);
  });
});

describe("foodWeek — what was eaten", () => {
  it("adds each day's meals, and leaves other weeks out", () => {
    const days = week({
      meals: [
        meal("a", "2026-09-28", 500),
        meal("b", "2026-09-28", 700),
        meal("c", "2026-09-29", 1800),
        meal("d", "2026-09-27", 9999), // the Sunday before
      ],
    });
    expect(days[0].eaten).toBe(1200);
    expect(days[1].eaten).toBe(1800);
    expect(days[2].eaten).toBe(0);
  });

  it("drops a meal in its delete undo window, as the day's total does", () => {
    const days = week({
      meals: [meal("a", "2026-09-30", 600), meal("b", "2026-09-30", 400)],
      hiddenMealIds: new Set(["b"]),
    });
    expect(days[2].eaten).toBe(600);
  });

  it("counts calories the way the calorie card does", () => {
    // sumMealTotals: legacy bare `calories`, soft deletes skipped.
    const days = week({
      meals: [
        { id: "legacy", date: "2026-09-28", calories: 300 },
        { id: "gone", date: "2026-09-28", totalCalories: 900, deletedAt: 1 },
      ],
    });
    expect(days[0].eaten).toBe(300);
  });

  it("shows nothing eaten on a day that has not come yet", () => {
    // A queued write can carry a future date; the day is still unlived.
    const days = week({ meals: [meal("a", "2026-10-01", 400)] });
    expect(days[3]).toMatchObject({
      isFuture: true,
      eaten: 0,
      target: null,
      progress: null,
      over: 0,
    });
  });
});

describe("foodWeek — the target each day is measured against", () => {
  it("measures the day in view against the calorie card's target", () => {
    const days = week({
      meals: [meal("a", "2026-09-30", 1000)],
      snapshots: new Map([["2026-09-30", { calories: 2500, protein: 150 }]]),
      selectedTarget: 2000,
    });
    expect(days[2]).toMatchObject({ target: 2000, progress: 0.5 });
  });

  it("measures every other day against its target as it stood", () => {
    const days = week({
      selectedKey: "2026-09-30",
      meals: [meal("a", "2026-09-28", 1100)],
      snapshots: new Map([["2026-09-28", { calories: 2200, protein: 150 }]]),
      selectedTarget: 2000,
    });
    expect(days[0]).toMatchObject({ target: 2200, progress: 0.5 });
  });

  it("measures a day with no target against nothing", () => {
    const days = week({ meals: [meal("a", "2026-09-29", 1500)] });
    expect(days[1]).toMatchObject({
      eaten: 1500,
      target: null,
      progress: null,
      over: 0,
    });
  });

  it("treats a zero or missing target as none", () => {
    const zero = week({ selectedTarget: 0 });
    expect(zero[2].target).toBeNull();
    const nan = week({ selectedTarget: Number.NaN });
    expect(nan[2].target).toBeNull();
    const snap = week({
      snapshots: new Map([["2026-09-28", { calories: 0, protein: 0 }]]),
    });
    expect(snap[0].target).toBeNull();
  });
});

describe("foodWeek — the ring", () => {
  it("fills to the share eaten, and stops at full", () => {
    const days = week({
      meals: [meal("a", "2026-09-30", 2600)],
      selectedTarget: 2000,
    });
    expect(days[2].progress).toBe(1);
  });

  it("says how far over the target a day went", () => {
    const days = week({
      meals: [meal("a", "2026-09-30", 2600)],
      selectedTarget: 2000,
    });
    expect(days[2].over).toBeCloseTo(0.3);
  });

  it("is not over at exactly the target", () => {
    const days = week({
      meals: [meal("a", "2026-09-30", 2000)],
      selectedTarget: 2000,
    });
    expect(days[2]).toMatchObject({ progress: 1, over: 0 });
  });

  it("caps the overshoot at a second full ring", () => {
    const days = week({
      meals: [meal("a", "2026-09-30", 9000)],
      selectedTarget: 2000,
    });
    expect(days[2].over).toBe(1);
  });
});

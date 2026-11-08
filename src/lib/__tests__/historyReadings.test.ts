import { describe, expect, it } from "vitest";
import {
  chartWaitLine,
  comparisonStartKey,
  exerciseProgressReading,
  liftProgressReading,
  muscleRangeReading,
  muscleShareReading,
  rangeChangeReading,
} from "../historyReadings";
import { historyRange } from "../historyFigures";
import { addLocalDays, localDateString } from "../dateHelpers";
import type { LiftProgressRow } from "../liftProgress";
import { formatDayMonth } from "@/utils/formatters";

/**
 * The reading line under each History chart. Every case passes its own
 * day, so nothing depends on the clock the suite runs under; every date
 * the words carry is built with the same formatter the app uses, so the
 * cases hold in any locale or time zone.
 */

const NOW = new Date(2026, 10, 8, 14, 30, 0);
const NBSP = "\u00A0";
const day = (d: Date) => formatDayMonth(d).replace(/ /g, NBSP);
const keyOf = (daysAgo: number) => localDateString(addLocalDays(NOW, -daysAgo));
/** The rules' ceiling: 15 words a sentence. */
const words = (s: string) => s.split(/[\s\u00A0]+/).filter(Boolean).length;

describe("rangeChangeReading", () => {
  const base = {
    previousKnown: true,
    previousLabel: "the 30 days before",
    today: NOW,
  };

  it("says what was lifted against the range before, as an amount", () => {
    expect(
      rangeChangeReading({
        ...base,
        kind: "lifted",
        change: { direction: "down", text: "3.5k kg" },
      })
    ).toBe(`You lifted 3.5k${NBSP}kg less than the 30 days before.`);
    expect(
      rangeChangeReading({
        ...base,
        kind: "ran",
        change: { direction: "up", text: "41.0 km" },
      })
    ).toBe(`You ran 41.0${NBSP}km more than the 30 days before.`);
  });

  it("counts sessions as more or fewer, one and many", () => {
    expect(
      rangeChangeReading({
        ...base,
        kind: "sessions",
        change: { direction: "up", text: "5" },
      })
    ).toBe("You trained 5 more sessions than the 30 days before.");
    expect(
      rangeChangeReading({
        ...base,
        kind: "sessions",
        change: { direction: "down", text: "1" },
      })
    ).toBe("You trained 1 fewer session than the 30 days before.");
  });

  it("says when a range rounds to no change", () => {
    expect(rangeChangeReading({ ...base, kind: "lifted", change: null })).toBe(
      "You lifted about as much as in the 30 days before."
    );
    expect(rangeChangeReading({ ...base, kind: "ran", change: null })).toBe(
      "You ran about as far as in the 30 days before."
    );
    expect(
      rangeChangeReading({ ...base, kind: "sessions", change: null })
    ).toBe("You trained as many sessions as in the 30 days before.");
  });

  it("says nothing while the range before is unknown, rather than 'more than nothing'", () => {
    expect(
      rangeChangeReading({
        ...base,
        previousKnown: false,
        kind: "ran",
        change: null,
      })
    ).toBeNull();
  });

  it("gives an account younger than the range the day it starts comparing", () => {
    const from = addLocalDays(NOW, 25);
    expect(
      rangeChangeReading({
        ...base,
        kind: "lifted",
        change: null,
        comparesFromKey: localDateString(from),
      })
    ).toBe(`From ${day(from)}, this compares with the 30 days before.`);
  });

  it("names the year on a day that is not this year's", () => {
    const line = rangeChangeReading({
      ...base,
      kind: "lifted",
      change: null,
      comparesFromKey: "2027-01-04",
    });
    expect(line).toMatch(/2027/);
  });

  it("carries no judgement word and stays within 15 words", () => {
    const lines = [
      rangeChangeReading({
        ...base,
        kind: "lifted",
        change: { direction: "down", text: "12.4k kg" },
      }),
      rangeChangeReading({
        ...base,
        kind: "ran",
        change: { direction: "down", text: "18.0 km" },
      }),
      rangeChangeReading({
        ...base,
        kind: "sessions",
        change: { direction: "down", text: "4" },
      }),
      rangeChangeReading({
        ...base,
        previousLabel: "the 12 months before",
        kind: "sessions",
        change: null,
      }),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(
        /\b(fail|bad|poor|behind|over|too much|only|dipped|volume|load)\b/i
      );
      expect(words(line!)).toBeLessThanOrEqual(15);
    }
  });
});

describe("comparisonStartKey", () => {
  const createdDaysAgo = (daysAgo: number) => ({
    toMillis: () => addLocalDays(NOW, -daysAgo).getTime() + 9 * 3_600_000,
  });

  it("is the first day plus the range, for an account younger than the range", () => {
    const range = historyRange(30, { createdAt: createdDaysAgo(5), now: NOW });
    expect(range.joinedInRange).toBe(true);
    expect(comparisonStartKey(range)).toBe(
      localDateString(addLocalDays(NOW, 25))
    );
  });

  it("is null once the account is as old as the range, or its start unknown", () => {
    expect(
      comparisonStartKey(
        historyRange(30, { createdAt: createdDaysAgo(30), now: NOW })
      )
    ).toBeNull();
    expect(comparisonStartKey(historyRange(30, { now: NOW }))).toBeNull();
  });
});

function row(
  name: string,
  direction: LiftProgressRow["direction"],
  holding = false
): LiftProgressRow {
  const set = { date: keyOf(3), weight: 60, reps: 8 };
  return {
    exerciseId: name,
    name,
    sessions: 4,
    first: { ...set, date: keyOf(20) },
    latest: set,
    series: [1, 2, 3, 4],
    direction,
    newBest: null,
    holding: holding ? { best: set, sessionsSince: 3 } : null,
  } as LiftProgressRow;
}

describe("liftProgressReading", () => {
  it("counts the lifts whose top set went up, out of all of them", () => {
    expect(
      liftProgressReading(
        [
          row("Bench Press", "up"),
          row("Squat", "up", true),
          row("Row", "level"),
        ],
        "Last 30 days"
      )
    ).toBe("Your top set went up on 1 of 3 lifts in the last 30 days.");
  });

  it("states a stretch with none up as the number down, or held", () => {
    expect(
      liftProgressReading(
        [row("Bench Press", "down"), row("Row", "level")],
        "Last 3 months"
      )
    ).toBe("Your top set went down on 1 of 2 lifts in the last 3 months.");
    expect(
      liftProgressReading(
        [row("Bench Press", "level"), row("Row", "up", true)],
        "Last 7 days"
      )
    ).toBe("Your top set held level on both lifts in the last 7 days.");
    expect(
      liftProgressReading(
        [
          row("Bench Press", "level"),
          row("Row", "level"),
          row("Squat", "down", true),
        ],
        "Last 7 days"
      )
    ).toBe("Your top set held level on all 3 lifts in the last 7 days.");
  });

  it("reads one lift without 'of 1'", () => {
    expect(
      liftProgressReading([row("Bench Press", "up")], "Last 30 days")
    ).toBe("Your top set went up in the last 30 days.");
  });

  it("is null with no lift to read", () => {
    expect(liftProgressReading([], "Last 30 days")).toBeNull();
  });
});

describe("muscleShareReading", () => {
  it("names the group with the most sets, out of all of them", () => {
    expect(
      muscleShareReading({
        Legs: 64,
        Back: 52,
        Chest: 28,
        Shoulders: 24,
        Biceps: 12,
      })
    ).toBe("Most sets went to legs: 64 of 180.");
  });

  it("names a tie at the top, and an even split", () => {
    expect(muscleShareReading({ Chest: 32, Back: 32, Legs: 12 })).toBe(
      "Most sets went to chest & back: 32 each, of 76."
    );
    expect(muscleShareReading({ Chest: 32, Back: 32, Legs: 32 })).toBe(
      "Your sets split evenly: 32 sets each to chest, back & legs."
    );
  });

  it("reads one group, and ignores groups with no sets", () => {
    expect(muscleShareReading({ Chest: 4, Back: 0 })).toBe(
      "All 4 sets went to chest."
    );
    expect(muscleShareReading({ Chest: 1 })).toBe("Your 1 set went to chest.");
    expect(muscleShareReading({ Chest: 0 })).toBeNull();
  });
});

describe("muscleRangeReading", () => {
  it("counts the muscles under their range, out of all", () => {
    expect(muscleRangeReading({ total: 14, below: [], namedMax: 3 })).toBe(
      "All 14 muscles in their range"
    );
    expect(
      muscleRangeReading({
        total: 14,
        below: ["Side delts", "Abs"],
        namedMax: 3,
      })
    ).toBe("2 of 14 muscles below their range: side delts, abs");
    expect(
      muscleRangeReading({
        total: 14,
        below: [
          "Side delts",
          "Lower back",
          "Hamstrings",
          "Glutes",
          "Calves",
          "Abs",
        ],
        namedMax: 3,
      })
    ).toBe("6 of 14 muscles below their range");
  });
});

describe("exerciseProgressReading", () => {
  const p = (daysAgo: number, value: number) => ({
    date: keyOf(daysAgo),
    value,
  });

  it("is the latest point against the first in the range", () => {
    expect(
      exerciseProgressReading([p(60, 150), p(30, 160), p(2, 165)], "kg", NOW)
    ).toBe(`Up 15${NBSP}kg since ${day(addLocalDays(NOW, -60))}.`);
    expect(exerciseProgressReading([p(20, 12), p(2, 10)], "reps", NOW)).toBe(
      `Down 2${NBSP}reps since ${day(addLocalDays(NOW, -20))}.`
    );
  });

  it("keeps a half-step, shortens thousands, and reads a level line", () => {
    expect(
      exerciseProgressReading([p(20, 140), p(2, 142.5)], "kg", NOW)
    ).toMatch(/^Up 2\.5\u00A0kg since/);
    expect(
      exerciseProgressReading([p(20, 1000), p(2, 2400)], "kg", NOW)
    ).toMatch(/^Up 1\.4k\u00A0kg since/);
    expect(exerciseProgressReading([p(20, 140), p(2, 140)], "kg", NOW)).toBe(
      `Level with ${day(addLocalDays(NOW, -20))}.`
    );
  });

  it("needs two points", () => {
    expect(exerciseProgressReading([p(2, 140)], "kg", NOW)).toBeNull();
  });
});

describe("chartWaitLine", () => {
  it("counts down to the chart", () => {
    const lifts = { one: "lift", many: "lifts" };
    expect(chartWaitLine(0, 3, lifts)).toBe("Log 3 lifts for the chart");
    expect(chartWaitLine(1, 3, lifts)).toBe("Log 2 more lifts for the chart");
    expect(chartWaitLine(2, 3, lifts)).toBe("Log 1 more lift for the chart");
    expect(chartWaitLine(3, 3, lifts)).toBeNull();
  });

  it("stays inside the 30 characters a suppression line is given", () => {
    for (const noun of [
      { one: "lift", many: "lifts" },
      { one: "run", many: "runs" },
      { one: "day", many: "days" },
    ]) {
      for (let logged = 0; logged < 3; logged++) {
        expect(chartWaitLine(logged, 3, noun)!.length).toBeLessThanOrEqual(30);
      }
    }
  });
});

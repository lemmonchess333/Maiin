import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  rollingWindowStart,
  localDateString,
  addLocalDays,
} from "@/lib/dateHelpers";

/**
 * One range pill, one window.
 *
 * Analytics scopes three sections and compared the boundary three
 * different ways, so `1W` meant two different spans at once (#2358,
 * measured): lifting and running covered EIGHT dates because their
 * boundary was `today - rangeDays` against an inclusive comparison,
 * nutrition covered SEVEN because it kept the current time of day on the
 * boundary and so pushed that date out, and adherence divided by seven.
 *
 * The three comparison FORMS are all still different, and legitimately
 * so — a workout is a local date string, a run is a Timestamp, a meal is
 * a date string parsed back to midnight. What has to agree is the set of
 * dates they admit. That is what this pins.
 */

/** Exactly the comparisons the three sections make, given one boundary. */
const ADMITS = {
  // History `liftingData`: string compare against a local date key.
  lifting: (dateKey: string, since: Date) => dateKey >= localDateString(since),
  // useRunningStats: a run's completedAt, taken at that date's local midnight.
  running: (dateKey: string, since: Date) =>
    new Date(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10))
    ) >= since,
  // History `nutrition`: the meal's own date parsed back to local midnight.
  nutrition: (dateKey: string, since: Date) =>
    new Date(dateKey + "T00:00:00") >= since,
} as const;

/** Candidate dates spanning the boundary generously on both sides. */
function candidates(today: Date, span: number): string[] {
  const out: string[] = [];
  for (let i = span; i >= 0; i--)
    out.push(localDateString(addLocalDays(today, -i)));
  return out;
}

const RANGES = [7, 30, 90, 180, 365];

/* A Wednesday afternoon — mid-week and mid-day, so a boundary that
   leaned on either the weekday or the clock would show up. */
const NOW = new Date(2026, 8, 16, 14, 30, 0);

describe("the three Analytics sections admit the same dates", () => {
  it.each(RANGES)("%i-day range", (rangeDays) => {
    const since = rollingWindowStart(rangeDays, NOW);
    const dates = candidates(NOW, rangeDays + 3);
    const admitted = Object.fromEntries(
      Object.entries(ADMITS).map(([name, fn]) => [
        name,
        dates.filter((d) => fn(d, since)),
      ])
    );
    expect(admitted.running).toEqual(admitted.lifting);
    expect(admitted.nutrition).toEqual(admitted.lifting);
  });

  it.each(RANGES)(
    "%i-day range covers exactly that many dates, ending today",
    (rangeDays) => {
      /* The adherence figure divides days-logged by `rangeDays`, so the
         window has to hold exactly `rangeDays` dates or the percentage is
         measured against a span nobody covered. */
      const since = rollingWindowStart(rangeDays, NOW);
      const admitted = candidates(NOW, rangeDays + 3).filter((d) =>
        ADMITS.lifting(d, since)
      );
      expect(admitted).toHaveLength(rangeDays);
      expect(admitted[admitted.length - 1]).toBe(localDateString(NOW));
    }
  );

  it("the boundary date is IN the window, under every comparison", () => {
    // Nutrition's old form excluded it; the other two included it. That
    // disagreement is the defect in one line.
    const since = rollingWindowStart(7, NOW);
    const boundary = localDateString(since);
    for (const [name, fn] of Object.entries(ADMITS))
      expect(fn(boundary, since), `${name} drops its own boundary date`).toBe(
        true
      );
  });

  it("the day before the boundary is OUT, under every comparison", () => {
    const since = rollingWindowStart(7, NOW);
    const before = localDateString(addLocalDays(since, -1));
    for (const [name, fn] of Object.entries(ADMITS))
      expect(fn(before, since), `${name} reaches past its boundary`).toBe(
        false
      );
  });

  it("disagreed before the fix — the shape this test exists for", () => {
    /* Reconstructs the two old boundaries and shows them admitting
       different sets, so the assertions above cannot be passing merely
       because the comparisons happen to be equivalent. */
    const handRolled = new Date(NOW);
    handRolled.setDate(handRolled.getDate() - 7); // keeps the clock
    const dates = candidates(NOW, 10);
    const oldLifting = dates.filter((d) => ADMITS.lifting(d, handRolled));
    const oldNutrition = dates.filter((d) => ADMITS.nutrition(d, handRolled));
    expect(oldLifting).toHaveLength(8);
    expect(oldNutrition).toHaveLength(7);
    expect(oldNutrition).not.toEqual(oldLifting);
  });
});

describe("no hand-rolled boundary survives", () => {
  it.each([
    ["src/pages/History.tsx", /setDate\(\s*\w+\.getDate\(\) - rangeDays\s*\)/],
    [
      "src/hooks/useRunningStats.ts",
      /addLocalDays\(\s*parseLocalDate\(today\),\s*-days\s*\)/,
    ],
  ])("%s", (path, pattern) => {
    /* Each of these re-derived the window by hand, and each was one off
       from what its own number said. A new copy would reintroduce the
       disagreement silently, because nothing downstream reads as wrong. */
    expect(
      pattern.test(readFileSync(path, "utf8")),
      `${path} derives a range boundary by hand — use rollingWindowStart`
    ).toBe(false);
  });
});

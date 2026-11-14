/**
 * The activity level offer's rules (whole-app grill Q31): the week's
 * average, the step bands, the once-a-week disagreement rule, the lift
 * hold on a move down, and the 30-day "Keep".
 */
import { describe, it, expect } from "vitest";
import {
  ACTIVITY_LEVEL_ORDER,
  ACTIVITY_SHORT_NAMES,
  BAND_MARGIN_STEPS,
  MIN_STEP_DAYS,
  STEP_BAND_FLOOR,
  STEP_OFFER_DISMISS_DAYS,
  activityLevelForSteps,
  isStepOfferDismissed,
  lastFullStepWeek,
  stepActivityOffer,
  stepActivityOfferWords,
  stepsAgreeWith,
  stepsFeedTheTarget,
  weekStepAverage,
} from "../stepActivity";
import { calculateTDEE } from "../tdee";
import { localDateString } from "../dateHelpers";
import type { DailyValue } from "../bodySignals";

const DAY_MS = 86_400_000;

/** Wednesday 11 November 2026; its last full week is 2 to 8 November. */
const WEDNESDAY = "2026-11-11";
const LAST_WEEK = [
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
  "2026-11-08",
];

function week(values: readonly (number | null)[]): DailyValue[] {
  return values.flatMap((value, i) =>
    value === null ? [] : [{ dateKey: LAST_WEEK[i], value }]
  );
}

function offerFor(
  overrides: Partial<Parameters<typeof stepActivityOffer>[0]> = {}
) {
  return stepActivityOffer({
    storedLevel: "light",
    dailySteps: week([11000, 11000, 11000, 11000, 11000, 11000, 11000]),
    todayKey: WEDNESDAY,
    liftDays: [],
    dismissedAtMs: null,
    nowMs: Date.now(),
    ...overrides,
  });
}

describe("the step bands (Tudor-Locke and Bassett, 2004)", () => {
  it("start at 5,000, 7,500, 10,000 and 12,500 steps a day", () => {
    const cases: Array<[number, string]> = [
      [0, "sedentary"],
      [4999, "sedentary"],
      [5000, "light"],
      [7499, "light"],
      [7500, "moderate"],
      [9999, "moderate"],
      [10000, "active"],
      [12499, "active"],
      [12500, "very_active"],
      [30000, "very_active"],
    ];
    for (const [steps, level] of cases) {
      expect(activityLevelForSteps(steps), `${steps} steps`).toBe(level);
    }
  });

  it("rise in the order the calorie maths multiplies the levels by", () => {
    // Each band is for a level that burns more than the one before, so a
    // higher step average can never offer a lower target.
    const tdees = ACTIVITY_LEVEL_ORDER.map(
      (level) => calculateTDEE(75, 178, 32, level, "recomp").tdee
    );
    const floors = ACTIVITY_LEVEL_ORDER.map((level) => STEP_BAND_FLOOR[level]);
    for (let i = 1; i < ACTIVITY_LEVEL_ORDER.length; i++) {
      expect(tdees[i]).toBeGreaterThan(tdees[i - 1]);
      expect(floors[i]).toBeGreaterThan(floors[i - 1]);
    }
  });

  it("count as agreeing within 500 steps of a level's band", () => {
    expect(BAND_MARGIN_STEPS).toBe(500);
    // Moderate is 7,500 to 9,999.
    expect(stepsAgreeWith("moderate", 7000)).toBe(true);
    expect(stepsAgreeWith("moderate", 6999)).toBe(false);
    expect(stepsAgreeWith("moderate", 10499)).toBe(true);
    expect(stepsAgreeWith("moderate", 10500)).toBe(false);
    // The ends have no band past them.
    expect(stepsAgreeWith("sedentary", 0)).toBe(true);
    expect(stepsAgreeWith("sedentary", 5499)).toBe(true);
    expect(stepsAgreeWith("sedentary", 5500)).toBe(false);
    expect(stepsAgreeWith("very_active", 40000)).toBe(true);
    expect(stepsAgreeWith("very_active", 11999)).toBe(false);
  });
});

describe("the week it reads", () => {
  it("is the last full Monday to Sunday week, whatever day it is now", () => {
    // Every day of the week of 9 November reads 2 to 8 November: the
    // answer is the same all week.
    for (let d = 9; d <= 15; d++) {
      const today = `2026-11-${String(d).padStart(2, "0")}`;
      const w = lastFullStepWeek(today);
      expect(w.weekKey, today).toBe("2026-11-02");
      expect(w.dayKeys).toEqual(LAST_WEEK);
    }
    // The next Monday moves on a week.
    expect(lastFullStepWeek("2026-11-16").weekKey).toBe("2026-11-09");
  });

  it("spans local midnight to local midnight, across a clock change too", () => {
    // 19 to 25 October holds the end of summer time in Europe; a 25-hour
    // day must not move a boundary off midnight or lose a day.
    const w = lastFullStepWeek("2026-10-28");
    expect(w.dayKeys).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(localDateString(w.start)).toBe("2026-10-19");
    expect(localDateString(w.end)).toBe("2026-10-26");
    expect(w.start.getHours()).toBe(0);
    expect(w.end.getHours()).toBe(0);
  });
});

describe("the week's average", () => {
  it("counts only the days with a reading", () => {
    // Two days with nothing recorded (a phone left on the side) do not
    // pull the average down.
    const avg = weekStepAverage(
      week([8000, null, 9000, 0, 10000, 8000, 9000]),
      LAST_WEEK
    );
    expect(avg).toEqual({ average: 8800, days: 5 });
  });

  it(`says nothing under ${MIN_STEP_DAYS} days with a reading`, () => {
    expect(MIN_STEP_DAYS).toBe(5);
    expect(
      weekStepAverage(
        week([8000, null, 9000, null, 10000, 8000, null]),
        LAST_WEEK
      )
    ).toBeNull();
  });

  it("ignores days outside the week, and adds two buckets for one day", () => {
    const avg = weekStepAverage(
      [
        ...week([6000, 6000, 6000, 6000, 6000, null, null]),
        // A day bucket split in two (a clock change) is still one day.
        { dateKey: LAST_WEEK[0], value: 1000 },
        // This week's partial day and the week before are not read.
        { dateKey: "2026-11-09", value: 40000 },
        { dateKey: "2026-11-01", value: 40000 },
      ],
      LAST_WEEK
    );
    expect(avg).toEqual({ average: 6200, days: 5 });
  });
});

describe("when the steps and the level disagree", () => {
  it("offers the level the steps fall in, up", () => {
    expect(offerFor()).toEqual({
      weekKey: "2026-11-02",
      averageSteps: 11000,
      daysCounted: 7,
      from: "light",
      to: "active",
      direction: "up",
    });
  });

  it("offers nothing when they agree", () => {
    expect(offerFor({ storedLevel: "active" })).toBeNull();
    // Inside the margin is agreeing too.
    expect(
      offerFor({
        storedLevel: "moderate",
        dailySteps: week([10400, 10400, 10400, 10400, 10400, 10400, 10400]),
      })
    ).toBeNull();
  });

  it("offers nothing without five days of steps", () => {
    expect(
      offerFor({
        dailySteps: week([11000, 11000, 11000, 11000, null, null, null]),
      })
    ).toBeNull();
  });

  it("reads an account with no level as the moderate the maths assumes", () => {
    expect(offerFor({ storedLevel: undefined })?.from).toBe("moderate");
    expect(
      offerFor({
        storedLevel: null,
        dailySteps: week([8000, 8000, 8000, 8000, 8000, 8000, 8000]),
      })
    ).toBeNull();
  });

  it("offers a move down only in a week with no lift logged", () => {
    const low = week([4000, 4000, 4000, 4000, 4000, 4000, 4000]);
    // Positive first: no lifts, a move down from Active.
    expect(offerFor({ storedLevel: "active", dailySteps: low })).toMatchObject({
      to: "sedentary",
      direction: "down",
    });
    // Steps miss lifting: one lift in the week holds it.
    expect(
      offerFor({
        storedLevel: "active",
        dailySteps: low,
        liftDays: ["2026-11-05"],
      })
    ).toBeNull();
    // A lift in another week holds nothing.
    expect(
      offerFor({
        storedLevel: "active",
        dailySteps: low,
        liftDays: ["2026-11-10", "2026-10-30"],
      })
    ).toMatchObject({ direction: "down" });
  });

  it("offers a move up whatever was lifted, since steps only undercount", () => {
    expect(offerFor({ liftDays: LAST_WEEK })).toMatchObject({
      to: "active",
      direction: "up",
    });
  });

  it("gives the same answer every day of the week, and today's steps count for nothing", () => {
    const days = ["09", "10", "11", "12", "13", "14", "15"];
    const answers = days.map((d) =>
      stepActivityOffer({
        storedLevel: "light",
        dailySteps: [
          ...week([11000, 11000, 11000, 11000, 11000, 11000, 11000]),
          // A lazy day this week changes nothing until next Monday.
          { dateKey: `2026-11-${d}`, value: 500 },
        ],
        todayKey: `2026-11-${d}`,
        liftDays: [],
        dismissedAtMs: null,
        nowMs: Date.now(),
      })
    );
    for (const answer of answers) expect(answer).toEqual(answers[0]);
    expect(answers[0]?.to).toBe("active");
  });
});

describe(`"Keep" hides the offer for ${STEP_OFFER_DISMISS_DAYS} days`, () => {
  const now = Date.now();

  it("for 30 days, then asks again", () => {
    expect(STEP_OFFER_DISMISS_DAYS).toBe(30);
    expect(offerFor({ dismissedAtMs: now - 29 * DAY_MS, nowMs: now })).toBe(
      null
    );
    expect(
      offerFor({ dismissedAtMs: now - 30 * DAY_MS, nowMs: now })
    ).not.toBeNull();
  });

  it("reads a time in the future (a phone's clock set wrong) as no answer", () => {
    expect(isStepOfferDismissed(now + DAY_MS, now)).toBe(false);
    expect(isStepOfferDismissed(null, now)).toBe(false);
    expect(isStepOfferDismissed(Number.NaN, now)).toBe(false);
    expect(isStepOfferDismissed(now - DAY_MS, now)).toBe(true);
  });
});

describe("where steps can change the target", () => {
  it("only for Pro, on the formula's target, with no number of its own", () => {
    const pro = { isPro: true, adaptiveSource: "formula" as const };
    expect(stepsFeedTheTarget({ ...pro, manualTarget: false })).toBe(true);
    // Free: Q45 makes the body's data adjusting things Pro.
    expect(
      stepsFeedTheTarget({ ...pro, isPro: false, manualTarget: false })
    ).toBe(false);
    // A learned target already follows what the person burns.
    expect(
      stepsFeedTheTarget({
        ...pro,
        adaptiveSource: "learned",
        manualTarget: false,
      })
    ).toBe(false);
    // A manual target ignores the level.
    expect(stepsFeedTheTarget({ ...pro, manualTarget: true })).toBe(false);
  });
});

describe("the offer's words", () => {
  const format = {
    steps: (n: number) => String(n),
    kcal: (n: number) => `${n} kcal`,
  };

  it("says the verdict, the number and the target it sets", () => {
    const words = stepActivityOfferWords(
      offerFor()!,
      { now: 2380, next: 2710 },
      format
    );
    expect(words).toEqual({
      heading: "Your steps say Active",
      line: "You averaged 11000 steps a day last week. Your target assumes Light.",
      target: "Active sets your target to 2710 kcal, up from 2380 kcal.",
      caveat: null,
      accept: "Use Active",
      keep: "Keep Light",
    });
  });

  it("names what steps miss on a move down", () => {
    const down = offerFor({
      storedLevel: "active",
      dailySteps: week([4000, 4000, 4000, 4000, 4000, 4000, 4000]),
    })!;
    const words = stepActivityOfferWords(
      down,
      { now: 2710, next: 2100 },
      format
    );
    expect(words.target).toBe(
      "Sedentary sets your target to 2100 kcal, down from 2710 kcal."
    );
    expect(words.caveat).toBe(
      "Steps miss cycling and swimming, so keep Active if you do those."
    );
  });

  it("keeps every button to a verb and its object, 20 characters or fewer", () => {
    for (const from of ACTIVITY_LEVEL_ORDER) {
      for (const to of ACTIVITY_LEVEL_ORDER) {
        if (from === to) continue;
        const words = stepActivityOfferWords(
          {
            weekKey: "2026-11-02",
            averageSteps: 9000,
            daysCounted: 7,
            from,
            to,
            direction:
              ACTIVITY_LEVEL_ORDER.indexOf(to) >
              ACTIVITY_LEVEL_ORDER.indexOf(from)
                ? "up"
                : "down",
          },
          { now: 2000, next: 2200 },
          format
        );
        expect(words.accept.length).toBeLessThanOrEqual(20);
        expect(words.keep.length).toBeLessThanOrEqual(20);
        expect(words.accept).toBe(`Use ${ACTIVITY_SHORT_NAMES[to]}`);
      }
    }
  });
});

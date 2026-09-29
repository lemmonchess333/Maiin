import { describe, it, expect } from "vitest";
import {
  calcWeightTrend,
  calculateEMA,
  userGoalWeightKg,
  projectGoalDate,
  currentWeightRate,
  recentWeeklyRate,
  RATE_WINDOW_DAYS,
  weeklyWeightAverages,
} from "../weightTrend";
import {
  addLocalDays,
  localDateString,
  startOfLocalWeek,
} from "@/lib/dateHelpers";

describe("calcWeightTrend", () => {
  it("returns null for empty entries", () => {
    expect(calcWeightTrend([])).toBeNull();
  });

  it("works with a single entry", () => {
    const result = calcWeightTrend([{ date: "2026-03-15", weight: 80 }]);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(80);
    expect(result!.avg7d).toBe(80);
    expect(result!.delta).toBe(0);
    expect(result!.direction).toBe("stable");
    expect(result!.sparkline).toEqual([80]);
  });

  it("computes 7-day average from the last 7 calendar days (daily logger)", () => {
    const entries = [
      { date: "2026-03-09", weight: 80 },
      { date: "2026-03-10", weight: 80.5 },
      { date: "2026-03-11", weight: 79.5 },
      { date: "2026-03-12", weight: 80 },
      { date: "2026-03-13", weight: 80.2 },
      { date: "2026-03-14", weight: 80.1 },
      { date: "2026-03-15", weight: 80.3 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.current).toBe(80.3);
    expect(result.avg7d).toBe(80.1);
    expect(result.delta).toBe(0.2);
    expect(result.direction).toBe("up");
  });

  it("classifies direction as stable when delta < 0.2", () => {
    const entries = [
      { date: "2026-03-14", weight: 80 },
      { date: "2026-03-15", weight: 80.1 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.direction).toBe("stable");
  });

  it("classifies direction as down when delta < -0.2", () => {
    const entries = [
      { date: "2026-03-09", weight: 82 },
      { date: "2026-03-10", weight: 81.5 },
      { date: "2026-03-11", weight: 81 },
      { date: "2026-03-12", weight: 80.5 },
      { date: "2026-03-13", weight: 80 },
      { date: "2026-03-14", weight: 80 },
      { date: "2026-03-15", weight: 79.5 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.direction).toBe("down");
  });

  it("caps sparkline to the last 30 calendar days (daily logger)", () => {
    // 40 consecutive real dates ending 2026-03-11.
    const entries = Array.from({ length: 40 }, (_, i) => {
      const d = new Date("2026-01-31T12:00:00");
      d.setDate(d.getDate() + i);
      return {
        date: d.toISOString().slice(0, 10),
        weight: 80 + i * 0.1,
      };
    });
    const result = calcWeightTrend(entries)!;
    expect(result.sparkline.length).toBe(30);
  });

  it("windows by CALENDAR days, not entry count — a sparse logger's 7-day avg only spans 7 days", () => {
    // Weekly logger: 8 entries across 8 weeks. slice(-7) would have
    // averaged ~7 WEEKS of history and called it a "7-day avg"; the
    // calendar window includes only entries within 7 days of the latest.
    const entries = Array.from({ length: 8 }, (_, i) => ({
      date: `2026-0${Math.floor(i / 4) + 1}-${String((i % 4) * 7 + 1).padStart(2, "0")}`,
      weight: 84 - i * 0.5,
    }));
    // Entries land on 01-01, 01-08, 01-15, 01-22, 02-01, 02-08, 02-15,
    // 02-22. Latest is 2026-02-22 @ 80.5; the 7-day cutoff (2026-02-16)
    // excludes 02-15, so only the latest entry qualifies.
    const result = calcWeightTrend(entries)!;
    expect(result.current).toBe(80.5);
    expect(result.avg7d).toBe(80.5);
    expect(result.delta).toBe(0);
    // 30-day cutoff is 2026-01-24 → exactly the four February entries.
    expect(result.sparkline).toEqual([82, 81.5, 81, 80.5]);
  });

  it("sorts entries by date regardless of input order", () => {
    const entries = [
      { date: "2026-03-15", weight: 81 },
      { date: "2026-03-13", weight: 79 },
      { date: "2026-03-14", weight: 80 },
    ];
    const result = calcWeightTrend(entries)!;
    expect(result.current).toBe(81);
    expect(result.sparkline).toEqual([79, 80, 81]);
  });
});

describe("calculateEMA", () => {
  it("returns [] for empty input", () => {
    expect(calculateEMA([])).toEqual([]);
  });

  it("returns one row per input entry", () => {
    const entries = [
      { date: "2026-03-13", weight: 80 },
      { date: "2026-03-14", weight: 80.5 },
      { date: "2026-03-15", weight: 81 },
    ];
    const result = calculateEMA(entries);
    expect(result.length).toBe(3);
  });

  it("first row's trend equals the first input weight (seed)", () => {
    /* The EMA seeds with the first sample — trend = w[0] +
       factor * (w[0] - w[0]) = w[0]. */
    const result = calculateEMA([{ date: "2026-03-13", weight: 80 }]);
    expect(result[0].trend).toBe(80);
    expect(result[0].actual).toBe(80);
  });

  it("smooths step changes — trend lags actual on a jump", () => {
    /* Weight jumps from 80 → 85 between days. With factor 0.1, the
       trend should move from 80 toward 85 slowly (80.5 first step). */
    const result = calculateEMA([
      { date: "2026-03-13", weight: 80 },
      { date: "2026-03-14", weight: 85 },
    ]);
    expect(result[1].actual).toBe(85);
    /* trend = 80 + 0.1 * (85 - 80) = 80.5. */
    expect(result[1].trend).toBe(80.5);
  });

  it("rounds trend to one decimal place", () => {
    /* Forced computation that would produce 80.45 — rounding to
       one decimal gives 80.5 (banker's avoidance via Math.round). */
    const result = calculateEMA(
      [
        { date: "2026-03-13", weight: 80 },
        { date: "2026-03-14", weight: 84.5 },
      ],
      0.1
    );
    /* trend = 80 + 0.1 * 4.5 = 80.45 → Math.round → 80.5. */
    expect(result[1].trend).toBe(80.5);
  });

  it("respects a custom smoothing factor", () => {
    /* With factor 1.0 the trend equals the actual every step (no
       smoothing). With factor 0 it stays at the seed forever. */
    const entries = [
      { date: "2026-03-13", weight: 80 },
      { date: "2026-03-14", weight: 85 },
      { date: "2026-03-15", weight: 90 },
    ];
    const noSmoothing = calculateEMA(entries, 1.0);
    expect(noSmoothing[2].trend).toBe(90);

    const fullDamping = calculateEMA(entries, 0);
    expect(fullDamping[2].trend).toBe(80);
  });

  it("sorts entries by date ascending in the result", () => {
    const entries = [
      { date: "2026-03-15", weight: 81 },
      { date: "2026-03-13", weight: 79 },
      { date: "2026-03-14", weight: 80 },
    ];
    const result = calculateEMA(entries);
    expect(result.map((r) => r.date)).toEqual([
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ]);
  });

  it("trend value approaches actual over many same-value samples", () => {
    /* 30 days of constant 80kg should pin trend at exactly 80
       (seed stays at 80, every step adds 0). */
    const entries = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, "0")}`,
      weight: 80,
    }));
    const result = calculateEMA(entries);
    expect(result[29].trend).toBe(80);
  });
});

describe("userGoalWeightKg — the goal the user set, never one derived", () => {
  it("is the target weight while the user travels toward it", () => {
    expect(
      userGoalWeightKg({
        goalWeightKg: 78,
        weeklyRateKg: -0.5,
        program: { goal: "cut" },
      })
    ).toBe(78);
    expect(
      userGoalWeightKg({
        goalWeightKg: 84,
        weeklyRateKg: 0.25,
        program: { goal: "lean bulk" },
      })
    ).toBe(84);
  });

  it("is not the programme's start weight less 5 kg", () => {
    // What the chart used to invent: 90 - 5 = 85, a goal nobody set.
    expect(
      userGoalWeightKg({
        goalWeightKg: 78,
        weeklyRateKg: -0.5,
        program: { goal: "cut", startWeight: 90 } as { goal: string },
      })
    ).toBe(78);
    expect(
      userGoalWeightKg({
        program: { goal: "cut", startWeight: 90 } as { goal: string },
      })
    ).toBeUndefined();
  });

  it("is none for maintenance, including onboarding's signup-weight default", () => {
    // Onboarding stores the signup weight as the target with a rate of 0.
    expect(
      userGoalWeightKg({
        goalWeightKg: 82,
        weeklyRateKg: 0,
        program: { goal: "recomp" },
      })
    ).toBeUndefined();
  });

  it("is none when a legacy rate's sign contradicts the phase", () => {
    // Pre-NUTR-M2 unsigned rate on a cut: the direction cannot be trusted.
    expect(
      userGoalWeightKg({
        goalWeightKg: 78,
        weeklyRateKg: 0.5,
        program: { goal: "cut" },
      })
    ).toBeUndefined();
  });

  it("is none without a usable target", () => {
    for (const goalWeightKg of [undefined, null, 0, -3, Number.NaN]) {
      expect(
        userGoalWeightKg({
          goalWeightKg,
          weeklyRateKg: -0.5,
          program: { goal: "cut" },
        })
      ).toBeUndefined();
    }
    expect(userGoalWeightKg(null)).toBeUndefined();
    expect(userGoalWeightKg(undefined)).toBeUndefined();
  });
});

describe("projectGoalDate (Rev1 extraction — same gates as TrendWeight)", () => {
  const NOW = new Date("2026-06-28T10:00:00");
  // 28 days trending 80 → ~78.1 (about −0.07/day raw; EMA lags behind).
  const series = Array.from({ length: 28 }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    trend: Math.round((80 - i * 0.05) * 10) / 10,
  }));

  it("projects an ETA when confident and trending toward the goal", () => {
    const p = projectGoalDate({
      trendSeries: series,
      goalWeight: 75,
      hasProjection: true,
      now: NOW,
    });
    expect(p).not.toBeNull();
    expect(p!.weeks).toBeGreaterThan(0);
    expect(p!.date).toBeTruthy();
  });

  it("suppresses when the confidence gate failed", () => {
    expect(
      projectGoalDate({
        trendSeries: series,
        goalWeight: 75,
        hasProjection: false,
        now: NOW,
      })
    ).toBeNull();
  });

  it("suppresses on direction mismatch (trending away from goal)", () => {
    expect(
      projectGoalDate({
        trendSeries: series, // trending DOWN
        goalWeight: 85, // goal is UP
        hasProjection: true,
        now: NOW,
      })
    ).toBeNull();
  });

  it("suppresses a flat trend and ETAs beyond ~2 years", () => {
    const flat = series.map((p) => ({ ...p, trend: 80 }));
    expect(
      projectGoalDate({
        trendSeries: flat,
        goalWeight: 75,
        hasProjection: true,
        now: NOW,
      })
    ).toBeNull();

    const glacial = Array.from({ length: 28 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      trend: 80 - i * 0.0005,
    }));
    expect(
      projectGoalDate({
        trendSeries: glacial,
        goalWeight: 70,
        hasProjection: true,
        now: NOW,
      })
    ).toBeNull();
  });

  it("suppresses without a goal", () => {
    expect(
      projectGoalDate({
        trendSeries: series,
        goalWeight: undefined,
        hasProjection: true,
        now: NOW,
      })
    ).toBeNull();
  });
});

describe("recentWeeklyRate", () => {
  // Local day keys counted back from a fixed day: no clock reads.
  const END = new Date(2026, 8, 28);
  const day = (n: number) => localDateString(addLocalDays(END, -n));
  const line = (days: number, start: number, perDay: number) =>
    Array.from({ length: days + 1 }, (_, i) => ({
      date: day(days - i),
      trend: start + i * perDay,
    }));

  it("reads the last four weeks of the trend, in kg a week", () => {
    const rate = recentWeeklyRate(line(60, 90, -0.05));
    expect(rate?.kgPerWeek).toBeCloseTo(-0.35);
    expect(rate?.fromDate).toBe(day(RATE_WINDOW_DAYS));
    expect(rate?.toDate).toBe(day(0));
  });

  it("is the recent rate, not the history's average", () => {
    // Six weeks gaining, then four losing.
    const gaining = line(70, 80, 0.05).slice(0, 43);
    const peak = gaining[gaining.length - 1].trend;
    const losing = Array.from({ length: 28 }, (_, i) => ({
      date: day(27 - i),
      trend: peak - (i + 1) * 0.06,
    }));
    const rate = recentWeeklyRate([...gaining, ...losing]);
    expect(rate!.kgPerWeek).toBeLessThan(0);
  });

  it("uses the whole history when it is shorter than the window", () => {
    const rate = recentWeeklyRate(line(14, 80, -0.1));
    expect(rate?.fromDate).toBe(day(14));
    expect(rate?.kgPerWeek).toBeCloseTo(-0.7);
  });

  it("has no rate from one day", () => {
    expect(recentWeeklyRate([{ date: day(0), trend: 80 }])).toBeNull();
  });
});

describe("the goal projection reads the recent rate", () => {
  const END = new Date(2026, 8, 28);
  const day = (n: number) => localDateString(addLocalDays(END, -n));

  it("projects toward a goal the last month is heading for, after a year going the other way", () => {
    // 300 days gaining 0.02 kg a day, then 28 days losing 0.05 a day:
    // the history's average is still up, the trend now is down.
    const series = [
      ...Array.from({ length: 300 }, (_, i) => ({
        date: day(327 - i),
        trend: 75 + i * 0.02,
      })),
      ...Array.from({ length: 28 }, (_, i) => ({
        date: day(27 - i),
        trend: 81 - (i + 1) * 0.05,
      })),
    ];
    const p = projectGoalDate({
      trendSeries: series,
      goalWeight: 76,
      hasProjection: true,
      now: END,
    });
    expect(p).not.toBeNull();
    // 3.6 kg to go at 0.35 kg a week is about ten weeks.
    expect(p!.weeks).toBeGreaterThanOrEqual(9);
    expect(p!.weeks).toBeLessThanOrEqual(11);
  });
});

describe("weeklyWeightAverages", () => {
  const TODAY = new Date(2026, 8, 30); // a Wednesday
  const MONDAY = startOfLocalWeek(TODAY);
  const on = (weeksBack: number, dayOfWeek: number, actual: number) => ({
    date: localDateString(addLocalDays(MONDAY, -7 * weeksBack + dayOfWeek)),
    actual,
  });

  it("averages each Monday week's weigh-ins, newest first", () => {
    const weeks = weeklyWeightAverages(
      [on(1, 0, 82), on(1, 3, 82.4), on(0, 0, 81.9), on(0, 1, 82.1)],
      { today: TODAY }
    );
    expect(weeks.map((w) => w.weekKey)).toEqual([
      localDateString(MONDAY),
      localDateString(addLocalDays(MONDAY, -7)),
    ]);
    expect(weeks[0]).toMatchObject({ weighIns: 2, current: true });
    expect(weeks[0].averageKg).toBeCloseTo(82);
    expect(weeks[0].changeKg).toBeCloseTo(-0.2);
    expect(weeks[1]).toMatchObject({ weighIns: 2, current: false });
  });

  it("leaves out an unweighed week, and makes no change across it", () => {
    const weeks = weeklyWeightAverages([on(3, 2, 84), on(1, 2, 83)], {
      today: TODAY,
    });
    expect(weeks).toHaveLength(2);
    expect(weeks[0].changeKg).toBeNull();
  });

  it("keeps the newest weeks when there are more than asked for", () => {
    const many = Array.from({ length: 9 }, (_, i) => on(i, 1, 80 + i));
    const weeks = weeklyWeightAverages(many, { today: TODAY, limit: 6 });
    expect(weeks).toHaveLength(6);
    expect(weeks[0].averageKg).toBe(80);
  });

  it("ignores a weigh-in that is not a weight", () => {
    const weeks = weeklyWeightAverages([on(0, 0, 82), on(0, 1, 0)], {
      today: TODAY,
    });
    expect(weeks[0]).toMatchObject({ weighIns: 1, averageKg: 82 });
  });
});

describe("currentWeightRate", () => {
  const END = new Date(2026, 8, 28);
  const day = (n: number) => localDateString(addLocalDays(END, -n));
  const daily = (days: number) =>
    Array.from({ length: days + 1 }, (_, i) => ({
      date: day(days - i),
      trend: 85 - i * 0.05,
    }));

  it("gives the recent rate once there is a month of weigh-ins", () => {
    expect(currentWeightRate(daily(40))?.kgPerWeek).toBeCloseTo(-0.35);
  });

  it("gives none before, where a rate would be a few noisy mornings", () => {
    expect(currentWeightRate(daily(20))).toBeNull();
  });
});

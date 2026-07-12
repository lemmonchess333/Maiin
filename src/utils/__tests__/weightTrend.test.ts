import { describe, it, expect } from "vitest";
import {
  calcWeightTrend,
  calculateEMA,
  deriveGoalWeightKg,
  projectGoalDate,
} from "../weightTrend";

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

describe("deriveGoalWeightKg (Rev1 extraction — mirrors TrendWeight)", () => {
  it("cut → −5kg, lean bulk → +3kg, maintain → startWeight", () => {
    expect(deriveGoalWeightKg({ startWeight: 80, goal: "cut" })).toBe(75);
    expect(deriveGoalWeightKg({ startWeight: 80, goal: "lean bulk" })).toBe(83);
    expect(deriveGoalWeightKg({ startWeight: 80, goal: "maintain" })).toBe(80);
  });

  it("no startWeight → undefined", () => {
    expect(deriveGoalWeightKg({ goal: "cut" })).toBeUndefined();
    expect(deriveGoalWeightKg(null)).toBeUndefined();
    expect(deriveGoalWeightKg(undefined)).toBeUndefined();
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

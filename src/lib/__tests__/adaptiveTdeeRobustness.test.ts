/**
 * What one bad weigh-in costs the learned TDEE.
 *
 * The estimator's slope was least squares until Nutr5 (2026-10-21). Least
 * squares averages symmetric noise away, but it does not resist leverage,
 * and in a short window the first and last weigh-ins carry all of it.
 * Measured on an engaged user (21 days of intake, 11 weigh-ins across 20
 * days, weight genuinely flat), least squares read:
 *
 *   outlier size    at an endpoint     in the middle
 *   +0.5 kg         ±88 kcal/day       0
 *   +1.0 kg         ±175 kcal/day      0
 *   +2.0 kg         ±350 kcal/day      0
 *
 * and at the warmup minimum (8 weigh-ins over 14 days) one reading 2 kg
 * high at the end took a 2,000 kcal maintenance to 1,358. A 1-2 kg
 * single-day swing is not exotic — hydration, sodium, glycogen, time of
 * day, a different scale — and the sign is the bad one: a high final
 * weigh-in reads as weight gain, so maintenance reads LOWER and the target
 * comes DOWN after a heavy weekend.
 *
 * The slope is now the median of the pairwise slopes (Theil-Sen). These
 * tests pin what that buys and what it costs:
 *
 *   - one bad weigh-in, anywhere and of any size, moves nothing;
 *   - a run of high readings long enough to be a real change is followed,
 *     and the target's per-window step clamp is what paces it;
 *   - on symmetric noise it is a little noisier than least squares, by a
 *     bounded amount (`leastSquaresTdee` below is the reference).
 */
import { describe, it, expect } from "vitest";
import { estimateAdaptiveTDEE } from "../adaptiveTdee";
import { MAX_WEEKLY_STEP_KCAL } from "../adaptiveTarget";

const day = (i: number) =>
  new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10);

/** 21 days logged at a steady intake — the trusted-day gate wants 10. */
const INTAKE = Array.from({ length: 21 }, (_, i) => ({
  dateKey: day(i),
  kcal: 2500,
}));

/** Every other day for three weeks: 11 weigh-ins, 20-day span. */
function weighIns(weights: number[]) {
  return weights.map((weightKg, i) => ({ dateKey: day(i * 2), weightKg }));
}
const FLAT = Array.from({ length: 11 }, () => 80);

function learned(weights: number[]): number {
  const r = estimateAdaptiveTDEE({
    intakeByDay: INTAKE,
    weighIns: weighIns(weights),
  });
  expect(r.ready, "fixture must clear the warmup gate").toBe(true);
  return r.learnedTDEE!;
}

/** FLAT with `kg` added to the weigh-ins at `indexes`. */
function withOutliers(indexes: number[], kg: number): number[] {
  return FLAT.map((w, i) => (indexes.includes(i) ? w + kg : w));
}

/** The fit the estimator replaced, kept as the yardstick for its cost. */
function leastSquaresTdee(weights: number[]): number {
  const xs = weights.map((_, i) => i * 2);
  const n = weights.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = weights.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (weights[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return Math.round(2500 - (num / den) * 7700);
}

/** A fixed sequence of ±0.4 kg noise, so the spread below is one number. */
function noisyFixtures(count: number): number[][] {
  let seed = 23;
  const next = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, () =>
    FLAT.map((w) => w + (next() - 0.5) * 0.8)
  );
}

const rms = (errors: number[]) =>
  Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);

describe("adaptive TDEE — the estimator is right on clean data", () => {
  it("reads maintenance when weight is flat", () => {
    expect(learned(FLAT)).toBe(2500);
  });

  it("reads a real deficit correctly", () => {
    // 0.5 kg/week off at 2500 kcal ⇒ maintenance ≈ 2500 + 7700×0.5/7 ≈ 3050.
    const losing = FLAT.map((w, i) => w - i * 2 * (0.5 / 7));
    expect(learned(losing)).toBe(3050);
  });
});

describe("adaptive TDEE — one bad weigh-in moves nothing", () => {
  it("absorbs SYMMETRIC noise", () => {
    const jittered = FLAT.map((w, i) => w + (i % 2 === 0 ? 0.6 : -0.6));
    expect(Math.abs(learned(jittered) - 2500)).toBeLessThan(60);
  });

  it("ignores one outlier at the end, at the start or in the middle", () => {
    // Least squares read 2325, 2675 and 2500 for these.
    expect(learned(withOutliers([10], 1))).toBe(2500);
    expect(learned(withOutliers([0], 1))).toBe(2500);
    expect(learned(withOutliers([5], 2))).toBe(2500);
  });

  it("ignores it whatever its size", () => {
    // Least squares lost 87, 175 and 350 kcal: linear in the outlier.
    for (const kg of [0.5, 1, 2]) {
      expect(learned(withOutliers([10], kg))).toBe(2500);
    }
  });

  it("holds a real deficit through a bad final weigh-in", () => {
    const losing = FLAT.map((w, i) => w - i * 2 * (0.5 / 7));
    losing[10] += 2;
    expect(learned(losing)).toBe(3050);
  });

  it("holds at the warmup minimum, where least squares read 1,358", () => {
    const intake = Array.from({ length: 15 }, (_, i) => ({
      dateKey: day(i),
      kcal: 2000,
    }));
    const sparse = (high: number) =>
      Array.from({ length: 8 }, (_, i) => ({
        dateKey: day(i * 2),
        weightKg: i === high ? 82 : 80,
      }));
    for (const high of [0, 7]) {
      const r = estimateAdaptiveTDEE({
        intakeByDay: intake,
        weighIns: sparse(high),
      });
      expect(r.ready).toBe(true);
      expect(r.learnedTDEE).toBe(2000);
    }
  });
});

describe("adaptive TDEE — what a real change, and noise, cost", () => {
  it("follows a run of high readings long enough to be a change, at the clamp's pace", () => {
    /* Three of the last eleven weigh-ins a kilo up are still outliers; the
       last four (a week) read as weight gained. That is the fit working,
       and the per-window step clamp is what stops a week's change moving
       the target in full in one step. */
    expect(learned(withOutliers([8, 9, 10], 1))).toBe(2500);
    const followed = 2500 - learned(withOutliers([7, 8, 9, 10], 1));
    expect(followed).toBe(385);
    expect(MAX_WEEKLY_STEP_KCAL).toBeLessThan(followed);
  });

  it("is a little noisier than least squares on symmetric noise, and no more", () => {
    // Measured: 94 kcal against least squares' 87 over these 200 fixtures.
    const fixtures = noisyFixtures(200);
    const theilSen = rms(fixtures.map((w) => learned(w) - 2500));
    const leastSquares = rms(fixtures.map((w) => leastSquaresTdee(w) - 2500));
    expect(Math.round(theilSen)).toBe(94);
    expect(Math.round(leastSquares)).toBe(87);
    expect(theilSen / leastSquares).toBeLessThan(1.15);
  });
});

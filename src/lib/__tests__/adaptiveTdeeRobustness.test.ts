/**
 * What one bad weigh-in costs the learned TDEE.
 *
 * `adaptiveTdee.ts`'s header makes three claims about noise, and they are
 * not equally covered:
 *
 *   1. first-vs-last differencing is "endpoint-sensitive and was the naive
 *      trap" — avoided, and the least-squares fit is what avoids it;
 *   2. "the regression IS the de-noiser: over the window, symmetric
 *      water/glycogen noise averages out of the fit";
 *   3. "Outlier-robust fits — Theil-Sen — are a v2 refinement."
 *
 * Claim 2 is true and is asserted below. Claim 3 concedes that a single
 * ASYMMETRIC outlier is a different problem, and nothing measured how much
 * of one. Least squares averages symmetric noise away; it does not resist
 * leverage, and in a short window the first and last weigh-ins carry all
 * of it.
 *
 * Measured 2026-08-11 on an engaged user — 21 days of intake, 11 weigh-ins
 * across 20 days, weight genuinely flat:
 *
 *   outlier size    at an endpoint     in the middle
 *   +0.5 kg         ±88 kcal/day       0
 *   +1.0 kg         ±175 kcal/day      0
 *   +2.0 kg         ±350 kcal/day      0
 *
 * A 1-2 kg single-day swing is not exotic — hydration, sodium, glycogen,
 * time of day, a different scale. It is the reason this app keeps a
 * smoothed trend weight for display at all.
 *
 * Note the SIGN. A high final weigh-in makes the fitted slope look like
 * weight gain, so the estimator concludes maintenance is LOWER and the
 * target comes DOWN. The direction that shows up after a heavy weekend is
 * the direction that cuts calories.
 *
 * This does NOT implement Theil-Sen. The header defers it deliberately and
 * that is a product decision; what was missing is the number the decision
 * should be made against. What these tests do:
 *
 *   - pin the leverage, so any change to the estimator shows its effect on
 *     robustness rather than only on the happy path;
 *   - assert the header's actual claim (symmetric noise averages out), so
 *     it stops being prose;
 *   - assert the mitigation that really bounds this — the target's
 *     per-window step clamp — because that, not the fit, is what stands
 *     between a bad weigh-in and the user's calories.
 *
 * IF THE v2 REFINEMENT LANDS, THE LEVERAGE TESTS BELOW SHOULD FAIL. That
 * is the intended behaviour, not a regression: swapping in a median-of-
 * pairwise-slopes fit drops the endpoint leverage to roughly nothing, and
 * these numbers should be rewritten to the new measurements rather than
 * deleted. Checked by doing it — a Theil-Sen substitution fails exactly
 * the four leverage cases and leaves the clean-data and symmetric-noise
 * ones passing, which is the shape a real improvement has.
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

describe("adaptive TDEE — what the fit does and does not absorb", () => {
  it("absorbs SYMMETRIC noise, as the header claims", () => {
    /* The claim under test, made executable: alternating ±0.6 kg on every
       weigh-in is far more total noise than any single outlier below, and
       it moves the answer barely at all. This is the half least squares
       genuinely handles. */
    const jittered = FLAT.map((w, i) => w + (i % 2 === 0 ? 0.6 : -0.6));
    expect(Math.abs(learned(jittered) - 2500)).toBeLessThan(60);
  });

  it("does NOT resist a single outlier at the END of the window", () => {
    // The measurement. 1 kg on the last weigh-in reads as weight gain, so
    // maintenance reads LOW — and the target follows it down.
    const heavyLast = [...FLAT];
    heavyLast[heavyLast.length - 1] = 81;
    expect(learned(heavyLast)).toBe(2325);
    expect(2500 - learned(heavyLast)).toBe(175);
  });

  it("does NOT resist one at the START either, with the sign flipped", () => {
    const heavyFirst = [...FLAT];
    heavyFirst[0] = 81;
    expect(learned(heavyFirst)).toBe(2675);
  });

  it("scales linearly with the size of the outlier", () => {
    /* Pinning the slope of the exposure, not one point on it — a change
       that halved the leverage should be visible here as a changed
       relationship, not just a changed number. */
    const at = (kg: number) => {
      const w = [...FLAT];
      w[w.length - 1] = 80 + kg;
      return 2500 - learned(w);
    };
    expect(at(0.5)).toBe(87);
    expect(at(1.0)).toBe(175);
    expect(at(2.0)).toBe(350);
  });

  it("is blind to an outlier in the MIDDLE — that is leverage, not noise", () => {
    /* Same 2 kg error, zero effect, because the midpoint has no leverage
       on a least-squares slope. It is the clearest statement of what the
       fit is actually vulnerable to: not the size of an error but where
       it lands. */
    const heavyMiddle = [...FLAT];
    heavyMiddle[5] = 82;
    expect(learned(heavyMiddle)).toBe(2500);
  });
});

describe("adaptive TDEE — what bounds the damage", () => {
  it("the per-window step clamp is smaller than a 1 kg outlier's error", () => {
    /* This is the load-bearing mitigation, and it is worth stating as a
       relationship rather than trusting the constant to stay put: a single
       bad weigh-in can move the ESTIMATE by 175 kcal, and the TARGET can
       only follow by 150 in that window. If the clamp were ever raised
       past the leverage, one weigh-in would move a user's calories in full
       in a single step. */
    const heavyLast = [...FLAT];
    heavyLast[heavyLast.length - 1] = 81;
    const estimateError = 2500 - learned(heavyLast);
    expect(MAX_WEEKLY_STEP_KCAL).toBeLessThan(estimateError);
  });
});

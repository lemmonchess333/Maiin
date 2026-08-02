/**
 * Epley 1RM contract tests.
 *
 * This suite used to cover 13 describe blocks over the old "shared
 * analytics utilities" module. Eleven of them tested helpers production
 * never called — the surfaces that consumed them were rewritten and the
 * helpers stayed behind. They went with the code they covered; a test over
 * an unreachable function proves nothing about production (ADR-0008).
 *
 * What's left is the part that IS load-bearing: the two guards that make
 * e1rm comparisons honest. `reps <= 0` stops a logged failed set scoring
 * weight×1.0 as a 1RM, and the `reps === 1` identity stops a true single
 * being inflated by 3.3%. History.tsx and ExerciseHistory.tsx both inlined
 * the raw formula without either correction before this existed.
 */
import { describe, it, expect } from "vitest";
import {
  epley1RMExact,
  estimate1RMRange,
  formatOneRepMaxRange,
  E1RM_MAX_REPS,
} from "../analytics";

/* `epley1RM` — the rounded variant — was deleted by handoff 12 when its only
   consumer (the PR row's `~N kg 1RM`) moved to a range. Its rounding now lives
   inside `estimate1RMRange`, and the cases it pinned are covered below and in
   the `estimate1RMRange` block: the reps<=0 / weight<=0 guards, the reps===1
   identity, and the arithmetic itself. */

describe("epley1RMExact", () => {
  it("is the raw Epley curve, unrounded", () => {
    expect(epley1RMExact(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 10);
    // The two worked cases the deleted rounded variant pinned.
    expect(Math.round(epley1RMExact(100, 5))).toBe(117);
    expect(Math.round(epley1RMExact(100, 10))).toBe(133);
  });

  it("a true single IS its 1RM — no 3.3% inflation, no rounding of plate weights", () => {
    // The inline copies this replaces scored 100kg x 1 as 103.3.
    expect(epley1RMExact(100, 1)).toBe(100);
    expect(epley1RMExact(102.5, 1)).toBe(102.5);
  });

  it("guards failed/empty sets — reps<=0 or weight<=0 never score", () => {
    expect(epley1RMExact(100, 0)).toBe(0);
    expect(epley1RMExact(100, -1)).toBe(0);
    expect(epley1RMExact(0, 8)).toBe(0);
  });
});

/* ─── e1RM as a range (handoff 12) ───────────────────────────────────────
   The defect is not that Epley is inaccurate — every 1RM formula is. It is
   that a single number carries CONSTANT implied confidence, so an estimate
   inferred from a set of 15 is displayed with the same authority as one from
   a set of 3. Schoenfeld p.92 measured how wrong that is: 7 to 24 reps to
   failure at the same %1RM across individuals, and for ONE person 80% 1RM
   being a 6RM on leg curl, a 10RM on bench and a 15RM on leg press.

   The tiers below are the sourced part. The exact percentages are a declared
   prior scaled against that one worked example, and the module says so. ── */
describe("estimate1RMRange", () => {
  it("a true single is exact — there is nothing to estimate", () => {
    const r = estimate1RMRange(100, 1);
    expect(r).toEqual({ point: 100, low: 100, high: 100, spread: 0 });
    // …and it formats without a range, because a span would be a lie.
    expect(formatOneRepMaxRange(r!)).toBe("100 kg");
  });

  it("widens monotonically with the rep count", () => {
    // The property, not the numbers: an estimate from more reps is never
    // presented as MORE confident than one from fewer.
    let previous = -1;
    for (let reps = 1; reps <= E1RM_MAX_REPS; reps++) {
      const r = estimate1RMRange(100, reps);
      expect(r, `${reps} reps`).not.toBeNull();
      expect(r!.spread, `${reps} reps`).toBeGreaterThanOrEqual(previous);
      previous = r!.spread;
    }
    // …and it genuinely does widen rather than being flat, which would make
    // the assertion above vacuous.
    expect(estimate1RMRange(100, 12)!.spread).toBeGreaterThan(
      estimate1RMRange(100, 4)!.spread
    );
  });

  it("is tight in the 3-6 region Helms p75 works in", () => {
    expect(estimate1RMRange(100, 3)!.spread).toBeLessThanOrEqual(0.05);
    expect(estimate1RMRange(100, 6)!.spread).toBeLessThanOrEqual(0.05);
  });

  it("returns NULL above ~15 reps rather than a very wide band", () => {
    // A ±40% band is not a weaker claim than a point estimate — the reader
    // anchors on its midpoint either way. When the map has broken down the
    // honest output is no number.
    expect(estimate1RMRange(100, E1RM_MAX_REPS)).not.toBeNull();
    expect(estimate1RMRange(100, E1RM_MAX_REPS + 1)).toBeNull();
    expect(estimate1RMRange(100, 30)).toBeNull();
  });

  it("declines an unloaded or failed set instead of returning zero", () => {
    // Zero would render as a real estimate. A bodyweight set has no kilogram
    // 1RM to give.
    expect(estimate1RMRange(0, 8)).toBeNull();
    expect(estimate1RMRange(100, 0)).toBeNull();
    expect(estimate1RMRange(100, -1)).toBeNull();
  });

  it("the point estimate still agrees with the ranking estimator", () => {
    // The band is for DISPLAY; `epley1RMExact` stays the single source for
    // comparisons, because overlapping bands have no order. They must not
    // drift into two different answers.
    for (const [w, r] of [
      [100, 5],
      [60, 12],
      [142.5, 3],
    ] as const) {
      expect(estimate1RMRange(w, r)!.point).toBe(
        Math.round(epley1RMExact(w, r))
      );
    }
  });

  it("brackets the point estimate symmetrically", () => {
    const r = estimate1RMRange(100, 8)!;
    expect(r.low).toBeLessThan(r.point);
    expect(r.high).toBeGreaterThan(r.point);
    expect(formatOneRepMaxRange(r)).toBe(`${r.low}–${r.high} kg`);
    // An en dash, not a hyphen — a hyphen between numerals reads as a minus.
    expect(formatOneRepMaxRange(r)).toContain("–");
    expect(formatOneRepMaxRange(r)).not.toContain("-");
  });
});

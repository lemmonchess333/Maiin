/**
 * Epley 1RM — the estimators the app actually uses.
 *
 * This module used to be a general "shared analytics utilities" grab bag:
 * exercise→muscle map, strength-trend slopes, volume-by-muscle, adherence
 * scoring, fatigue detection, insight copy — 22 exports over 314 lines,
 * with a 395-line suite over them.
 *
 * Production imported TWO of them. The surfaces that consumed the rest
 * were rewritten (the analytics tabs, the muscle heat map, the insight
 * strip) and the helpers stayed behind, still green, still proving
 * nothing about anything that runs — the ADR-0008 shape. The symbol-level
 * reachability gate found them once it stopped counting mentions in
 * COMMENTS as uses.
 *
 * Deleted rather than kept "in case": git has them, and a helper nobody
 * calls is a helper nobody has checked against the current data shapes.
 * If a future surface wants muscle-volume or adherence scoring, writing it
 * against that surface's real inputs beats resurrecting a guess.
 */

/* ================================
   EPLEY 1RM
================================ */

/*
 * `epley1RM` — the ROUNDED point estimate — was deleted here by handoff 12.
 *
 * Its only consumer was the PR row's `~N kg 1RM`, which is exactly the
 * constant-implied-confidence display that handoff replaced with a range. The
 * rounding it did now happens inside `estimate1RMRange`, and `epley1RMExact`
 * remains the single source for comparisons.
 *
 * Deleted rather than kept, per this module's own policy above: a helper
 * nobody calls is a helper nobody has checked against the current data shapes.
 * The symbol-level reachability gate is what noticed, one test run after the
 * call site moved.
 */

/**
 * Unrounded Epley — the single source for e1rm COMPARISONS (PR scoring,
 * best-set selection, chart series), where integer rounding could merge
 * near-ties and flip which set counts as the best. Same guards as
 * reps<=0 (a logged failed set must not score weight×1.0 as a
 * 1RM) and the reps===1 identity (a true single IS its 1RM — the raw
 * formula would inflate it by 3.3%). History.tsx and ExerciseHistory.tsx
 * previously inlined the raw formula without either correction.
 */
export function epley1RMExact(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/* ================================
   E1RM AS A RANGE (handoff 12)
================================ */

/**
 * An estimated 1RM with the confidence the estimate actually has.
 *
 * ── Why a range ──────────────────────────────────────────────────────────
 *
 * A bare Epley returns one number whatever it is fed, so a 1RM inferred from a
 * set of 15 is displayed with exactly the same authority as one inferred from
 * a set of 3. That implied constant confidence is wrong, and the corpus is
 * unusually direct about how wrong:
 *
 *   - **Schoenfeld p.92:** reps to failure at 75% 1RM ranged **7 to 24** across
 *     individuals; at 30% 1RM, **30 to 71**. And for ONE person, 80% 1RM was a
 *     10RM on bench, a **6RM** on leg curl and a **15RM** on leg press.
 *   - **Zatsiorsky p.62:** "there is **no fixed relationship** … This
 *     relationship varies with different athletes and motions."
 *   - **Helms p44:** the %1RM↔reps map is unreliable below roughly 90% 1RM.
 *   - **Helms p75** works with estimates in the 3–6 rep region, which is where
 *     they are tight enough to act on.
 *
 * ── Where the widths come from, and where they don't ─────────────────────
 *
 * The TIERS are sourced; the exact percentages are a declared prior, and
 * saying so matters more than picking better ones.
 *
 * Schoenfeld p.92's one-person example is the anchor available. Take the leg
 * press: 80% of 1RM yielded 15 reps, so for a true 1RM of 100 the lifter
 * pressed 80 for 15 — and Epley reads that as 80 × (1 + 15/30) = **120**, a
 * 20% overestimate. The same person's bench at 80% yielded 10 reps → Epley
 * 106.7, ~7% high. Their leg curl at 80% yielded 6 → Epley 96, ~4% low. One
 * subject and three exercises is not a calibration set, but it is a real
 * measurement of the right quantity, and it is what the ±20 / ±10 / ±5 tiers
 * below are scaled against rather than chosen by feel.
 *
 * Above ~15 reps the function returns **null** rather than a wider band. A
 * range of ±40% is not a weaker claim than a point estimate, it is a claim
 * that the reader will still anchor on the midpoint of; the honest output when
 * the map has broken down is no number at all.
 *
 * ── This is for DISPLAY, not for ranking ─────────────────────────────────
 *
 * `epley1RMExact` stays the single source for comparisons — best-set
 * selection, PR scoring, chart series. Ranking by a band is meaningless
 * (overlapping ranges have no order), and a surface that must pick a "best
 * set" needs a total order. So the point estimate keeps its job; what changes
 * is that nothing PRESENTS it as though its confidence were constant.
 */
export interface OneRepMaxRange {
  /** Epley's point estimate, rounded to the kilogram. */
  point: number;
  /** Lower bound, kg. */
  low: number;
  /** Upper bound, kg. */
  high: number;
  /** Fractional half-width the bounds were built from (0.05 = ±5%). */
  spread: number;
}

/**
 * Reps beyond which an estimate is not worth showing. Schoenfeld p.92's 30%
 * 1RM case (30 to 71 reps to failure) is the far end of the same breakdown;
 * ~15 is where the corpus stops supporting the map at all.
 */
export const E1RM_MAX_REPS = 15;

/** Half-width of the band, as a fraction of the point estimate. See the
 *  interface note for what these are scaled against. */
function e1rmSpread(reps: number): number {
  if (reps <= 1) return 0; // a true single IS the 1RM — not an estimate
  if (reps <= 6) return 0.05;
  if (reps <= 10) return 0.1;
  return 0.2;
}

/**
 * Estimated 1RM with its confidence band, or `null` when the rep count puts
 * the estimate outside what the sources support.
 *
 * Returns null for a non-positive load too: a bodyweight or uncalibrated set
 * has no kilogram estimate to give, and zero would read as a real one.
 */
export function estimate1RMRange(
  weight: number,
  reps: number
): OneRepMaxRange | null {
  if (reps <= 0 || weight <= 0) return null;
  if (reps > E1RM_MAX_REPS) return null;
  const point = epley1RMExact(weight, reps);
  const spread = e1rmSpread(reps);
  return {
    point: Math.round(point),
    low: Math.round(point * (1 - spread)),
    high: Math.round(point * (1 + spread)),
    spread,
  };
}

/**
 * The band as a display string — "95–105 kg", or an exact "100 kg" for a true
 * single, where there is no estimation to qualify.
 *
 * An en dash, not a hyphen: the range is a span, and the hyphen reads as a
 * minus sign next to numerals.
 */
export function formatOneRepMaxRange(r: OneRepMaxRange): string {
  return r.spread === 0 ? `${r.point} kg` : `${r.low}–${r.high} kg`;
}

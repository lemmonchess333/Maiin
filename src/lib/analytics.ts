/**
 * Epley 1RM — the two estimators the app actually uses.
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

export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/**
 * Unrounded Epley — the single source for e1rm COMPARISONS (PR scoring,
 * best-set selection, chart series), where integer rounding could merge
 * near-ties and flip which set counts as the best. Same guards as
 * epley1RM: reps<=0 (a logged failed set must not score weight×1.0 as a
 * 1RM) and the reps===1 identity (a true single IS its 1RM — the raw
 * formula would inflate it by 3.3%). History.tsx and ExerciseHistory.tsx
 * previously inlined the raw formula without either correction.
 */
export function epley1RMExact(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

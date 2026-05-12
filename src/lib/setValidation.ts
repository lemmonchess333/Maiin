/**
 * Central workout-set validator.
 *
 * PR E (audit P0 #4): pre-PR-E `WorkoutSession.completeSet` ran PR
 * detection directly on the user's typed reps + weight, mutated
 * `prMap`, fired confetti, and toasted — all on unvalidated input.
 * A fat-fingered 200kg × 5 bench became a permanent PR with no
 * confirmation. The undo path didn't revert the PR mutation either.
 *
 * This module is the single gate between user input and any
 * downstream PR / persistence side-effect.
 *
 *   - `severity: "block"` — invalid input, the set must not complete
 *     (caller surfaces an error toast and leaves the row editable).
 *   - `severity: "warn"` — input is sane but suspicious (e.g. a
 *     huge jump over the current PR). Caller should require an
 *     explicit confirmation before treating the set as a PR.
 *   - `ok: true` — input is normalised; caller can complete the set
 *     and run PR detection.
 *
 * Caps + decimal rules
 *   reps:    integer, finite, in [0, 100]. Decimal reps rejected.
 *   weight:  finite, in [0, 500] kg. Negative rejected. Decimal
 *            allowed; the caller may choose to round to 0.5kg /
 *            1.25kg, but we don't enforce that here because some
 *            barbells use different micro-plate steps. Step
 *            normalisation lives at the input layer where it can
 *            be exercise-aware.
 *   bodyweight: when the row has no weight column (bodyweight
 *            movement), `weight: 0` is allowed and the validator
 *            only checks reps.
 *
 * Jump rule
 *   If `currentBestForBucket` is provided and the new weight is
 *   > 1.25 × current (default), the result carries
 *   `severity: "warn"` so the caller can require confirmation
 *   before treating it as a PR.
 */

export type SetValidationResult =
  | { ok: true; normalized: { reps: number; weight: number }; warn?: undefined }
  | { ok: true; normalized: { reps: number; weight: number }; warn: SetValidationWarn }
  | { ok: false; severity: "block"; message: string };

export interface SetValidationWarn {
  severity: "warn";
  kind: "huge-jump";
  message: string;
  /** Caller-friendly confirm CTA wording, e.g. "Yes, log as PR". */
  confirmLabel: string;
  /** What the jump was, in case the caller wants to display it. */
  fromKg: number;
  toKg: number;
  ratio: number;
}

export interface SetValidationInput {
  reps: unknown;
  weight: unknown;
  /** True when the exercise has no weight column (bodyweight
   *  movement). Skips weight checks; reps still validated. */
  isBodyweight?: boolean;
  /** When present, enables the huge-jump warning. Caller's current
   *  best in the matching rep bucket. */
  currentBestForBucket?: number;
  /** Override the jump-warn ratio. Default 1.25 (> 25% over PR
   *  triggers warn). */
  jumpWarnRatio?: number;
}

const REP_MAX = 100;
const WEIGHT_MAX_KG = 500;
const DEFAULT_JUMP_WARN_RATIO = 1.25;

/**
 * Coerce raw user input (which may arrive as string from a text
 * input) into a finite number, or null when not parseable.
 */
function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function validateSet(input: SetValidationInput): SetValidationResult {
  const reps = toFiniteNumber(input.reps);
  if (reps === null) {
    return { ok: false, severity: "block", message: "Enter a rep count." };
  }
  if (reps < 0) {
    return { ok: false, severity: "block", message: "Reps can't be negative." };
  }
  if (!Number.isInteger(reps)) {
    return { ok: false, severity: "block", message: "Reps must be a whole number." };
  }
  if (reps === 0) {
    return { ok: false, severity: "block", message: "Log at least one rep to complete the set." };
  }
  if (reps > REP_MAX) {
    return { ok: false, severity: "block", message: `Reps look too high (max ${REP_MAX}). Check the value.` };
  }

  const weight = toFiniteNumber(input.weight);
  // Bodyweight exercises have no weight column — accept null/0
  // weight, validate only reps.
  const isBodyweight = input.isBodyweight === true;
  if (isBodyweight) {
    return { ok: true, normalized: { reps, weight: weight ?? 0 } };
  }

  if (weight === null) {
    return { ok: false, severity: "block", message: "Enter a weight." };
  }
  if (weight < 0) {
    return { ok: false, severity: "block", message: "Weight can't be negative." };
  }
  if (weight > WEIGHT_MAX_KG) {
    return {
      ok: false,
      severity: "block",
      message: `Weight looks too high (max ${WEIGHT_MAX_KG}kg). Check the value.`,
    };
  }

  // Jump check — only meaningful when caller supplies a current
  // best AND the current best is positive. A first-ever lift in a
  // bucket has no jump to compare against.
  const currentBest = input.currentBestForBucket;
  const jumpRatio = input.jumpWarnRatio ?? DEFAULT_JUMP_WARN_RATIO;
  if (typeof currentBest === "number" && currentBest > 0 && weight > 0) {
    const ratio = weight / currentBest;
    if (ratio > jumpRatio) {
      const pctOver = Math.round((ratio - 1) * 100);
      return {
        ok: true,
        normalized: { reps, weight },
        warn: {
          severity: "warn",
          kind: "huge-jump",
          message: `${weight}kg is ${pctOver}% over your current best (${currentBest}kg). Confirm it's right.`,
          confirmLabel: "Log as PR",
          fromKg: currentBest,
          toKg: weight,
          ratio,
        },
      };
    }
  }

  return { ok: true, normalized: { reps, weight } };
}

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
 *   - `severity: "warn"` — input is sane but suspicious (a jump
 *     past today's plan or the current best). The caller asks before
 *     the set completes.
 *   - `ok: true` — input is normalised; caller can complete the set
 *     and run PR detection.
 *
 * Caps + decimal rules
 *   reps:    integer, finite, in [0, 100]. Decimal reps rejected.
 *   seconds: a timed hold's `reps`: integer, in [1, 3,600] (Lift4 (14):
 *            a hold can be timed past 100 seconds).
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
 * Jump rules (Lift16)
 *   A weight more than twice today's planned weight (`plannedWeight`),
 *   or more than 1.25 × the best in its rep bucket
 *   (`currentBestForBucket`), carries `severity: "warn"`. The workout
 *   screen asks before the set completes ("125 kg? Today's plan is
 *   12.5 kg.", Log 125 kg / Change it): a set it logs moves the plan,
 *   which follows the load lifted, and the records, so a typo that
 *   only skipped the PR still moved the plan. The plan rule covers a
 *   first session, which has no best to compare against.
 */

export type SetValidationResult =
  | { ok: true; normalized: { reps: number; weight: number }; warn?: undefined }
  | {
      ok: true;
      normalized: { reps: number; weight: number };
      warn: SetValidationWarn;
    }
  | { ok: false; severity: "block"; message: string };

export interface SetValidationWarn {
  severity: "warn";
  /** Past twice today's plan, or 25% past the best for these reps. */
  kind: "past-plan" | "huge-jump";
  /** The question: "125 kg?" */
  title: string;
  /** What the weight is checked against: "Today's plan is 12.5 kg." */
  message: string;
  /** The confirm button: "Log 125 kg". */
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
  /** True for a timed hold, whose `reps` are seconds held. */
  timed?: boolean;
  /** When present, enables the huge-jump warning. Caller's current
   *  best in the matching rep bucket. */
  currentBestForBucket?: number;
  /** Today's planned weight for the lift: a weight more than twice it
   *  warns (Lift16). */
  plannedWeight?: number;
  /** Override the jump-warn ratio. Default 1.25 (> 25% over PR
   *  triggers warn). */
  jumpWarnRatio?: number;
}

const REP_MAX = 100;
const HOLD_MAX_SECONDS = 3600;
const WEIGHT_MAX_KG = 500;
const DEFAULT_JUMP_WARN_RATIO = 1.25;
const PLAN_WARN_RATIO = 2;

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
  const timed = input.timed === true;
  if (reps === null) {
    return {
      ok: false,
      severity: "block",
      message: timed ? "Enter the seconds held." : "Enter a rep count.",
    };
  }
  if (reps < 0) {
    return {
      ok: false,
      severity: "block",
      message: timed ? "Seconds can't be negative." : "Reps can't be negative.",
    };
  }
  if (!Number.isInteger(reps)) {
    return {
      ok: false,
      severity: "block",
      message: timed
        ? "Seconds must be a whole number."
        : "Reps must be a whole number.",
    };
  }
  if (reps === 0) {
    return {
      ok: false,
      severity: "block",
      message: timed
        ? "Log at least one second to complete the set."
        : "Log at least one rep to complete the set.",
    };
  }
  if (timed && reps > HOLD_MAX_SECONDS) {
    return {
      ok: false,
      severity: "block",
      message: "That hold looks too long (max 3,600 seconds). Check the value.",
    };
  }
  if (!timed && reps > REP_MAX) {
    return {
      ok: false,
      severity: "block",
      message: `Reps look too high (max ${REP_MAX}). Check the value.`,
    };
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
    return {
      ok: false,
      severity: "block",
      message: "Weight can't be negative.",
    };
  }
  if (weight > WEIGHT_MAX_KG) {
    return {
      ok: false,
      severity: "block",
      message: `Weight looks too high (max ${WEIGHT_MAX_KG} kg). Check the value.`,
    };
  }

  // Jump checks — each only meaningful against a positive weight to
  // compare with. The plan comes first: it is what the person was
  // asked to lift today.
  const planned = input.plannedWeight;
  if (typeof planned === "number" && planned > 0 && weight > 0) {
    const ratio = weight / planned;
    if (ratio > PLAN_WARN_RATIO)
      return {
        ok: true,
        normalized: { reps, weight },
        warn: {
          severity: "warn",
          kind: "past-plan",
          title: `${weight} kg?`,
          message: `Today's plan is ${planned} kg.`,
          confirmLabel: `Log ${weight} kg`,
          fromKg: planned,
          toKg: weight,
          ratio,
        },
      };
  }
  const currentBest = input.currentBestForBucket;
  const jumpRatio = input.jumpWarnRatio ?? DEFAULT_JUMP_WARN_RATIO;
  if (typeof currentBest === "number" && currentBest > 0 && weight > 0) {
    const ratio = weight / currentBest;
    if (ratio > jumpRatio)
      return {
        ok: true,
        normalized: { reps, weight },
        warn: {
          severity: "warn",
          kind: "huge-jump",
          title: `${weight} kg?`,
          message: `Your best at these reps is ${currentBest} kg.`,
          confirmLabel: `Log ${weight} kg`,
          fromKg: currentBest,
          toKg: weight,
          ratio,
        },
      };
  }

  return { ok: true, normalized: { reps, weight } };
}

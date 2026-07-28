/**
 * The adjustment rule (training-book backlog #9 — Helms H5).
 *
 * Tropos already had both inputs and used them independently: a plateau
 * rotated an exercise variation, and a weak recovery week rendered advisory
 * copy. Helms's adjustment flowchart is the JOINT rule that was missing:
 *
 *   Are you plateaued?
 *   ├─ No  → change nothing
 *   └─ Yes → Are you recovered?
 *            ├─ Yes → add volume
 *            └─ No  → cut volume / take a light week
 *                     └─ if you re-fatigue and stall AGAIN, the problem is
 *                        not fatigue — you need less total volume, or the
 *                        volume organised differently
 *
 * That last branch is the point of the item: it is a second-order rule that
 * only makes sense if something remembers what it already tried, which the
 * app can do across cycles and a lifter reliably can't.
 *
 * Presentation policy: INVISIBLE — the prescription changes; nothing is
 * named, explained, or surfaced. There is no "you are plateaued" screen.
 *
 * Pure and total: every input combination maps to exactly one action, and
 * `unknown` recovery is a first-class state rather than a falsy boolean.
 * That matters because the underlying `deloadRecommended` flag is FALSE
 * both when the user is fresh and when the engine has too little baseline
 * to judge (`bl.weeksUsed >= 3` in performanceEngine) — collapsing those
 * two into one boolean would read a cold-start user as "recovered" and add
 * volume to someone we know nothing about. Adding volume to an unrecovered
 * lifter is the harmful error here, so the ambiguous case holds.
 */

import type { WorkoutDay } from "./programTypes";

export type RecoveryState = "recovered" | "strained" | "unknown";

export type AdjustmentAction =
  | "hold"
  | "add_volume"
  | "reduce_volume"
  | "reorganize";

/**
 * `plateauCount` increments each time the progression engine backs a lift
 * off after consecutive failures, and resets to 0 on any completed set —
 * so a single count already means "stalled and hasn't recovered since".
 */
const PLATEAU_THRESHOLD = 1;

/**
 * How many plateaued lifts make it the PROGRAMME's problem rather than one
 * exercise's. One stalled lift is normal noise and is already handled by
 * the variation rotation; the flowchart is about a stalled cycle.
 */
export const PROGRAMME_PLATEAU_MIN = 2;

export interface AdjustmentSignals {
  /** Lifts currently sitting on a backed-off stall. */
  plateauedExercises: number;
  recovery: RecoveryState;
  /** Times we have already cut volume for this stall without it clearing. */
  priorReductions: number;
}

export function countPlateauedExercises(workouts: WorkoutDay[]): number {
  let n = 0;
  for (const day of workouts) {
    for (const ex of day.exercises) {
      if ((ex.plateauCount ?? 0) >= PLATEAU_THRESHOLD) n += 1;
    }
  }
  return n;
}

export function resolveAdjustment(s: AdjustmentSignals): AdjustmentAction {
  if (s.plateauedExercises < PROGRAMME_PLATEAU_MIN) return "hold";
  // No usable recovery read — do not act on a signal we don't have. The
  // pre-#9 behaviour (variation rotation on regenerate) still applies.
  if (s.recovery === "unknown") return "hold";
  if (s.recovery === "recovered") return "add_volume";
  return s.priorReductions >= 1 ? "reorganize" : "reduce_volume";
}

/**
 * Map the weekly performance doc's own signals onto the flowchart's
 * recovery question. Deliberately NOT the raw `recoveryScore`: PROGRAM-
 * ADAPT-01 locked that as a retrospective analytics input rather than a
 * readiness measure (see `easierTodayRecommendation`), and the same
 * reasoning applies here. `deloadFlag` and `recoveryWeak` are the engine's
 * own weekly-scope judgements, which is the scope this rule operates at.
 *
 * `lifetimeWeeks` gates confidence using the same depth the engine itself
 * requires before it will even compute `deloadRecommended`.
 */
export const MIN_WEEKS_FOR_RECOVERY_READ = 3;

export function recoveryStateFrom(
  signals:
    | {
        deloadFlag?: boolean;
        recoveryWeak?: boolean;
        lifetimeWeeks?: number;
      }
    | null
    | undefined
): RecoveryState {
  if (!signals) return "unknown";
  if ((signals.lifetimeWeeks ?? 0) < MIN_WEEKS_FOR_RECOVERY_READ) {
    return "unknown";
  }
  return signals.deloadFlag || signals.recoveryWeak ? "strained" : "recovered";
}

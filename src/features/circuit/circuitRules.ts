/**
 * What a finished circuit counts for (Circ1 (6), (2)): whether it is
 * saved at all, the calories it burned, and whether it is a best.
 */
import type { CircuitEffort, CircuitKind } from "./circuitTypes";

/**
 * A circuit is saved, and so counted for the streak, the feed and the
 * week, once it has run 7 minutes (Circ1 (6), (A)). The minutes are the
 * session clock without pauses or the count in (Circ1 (K)).
 */
export const CIRCUIT_MIN_SECONDS = 7 * 60;

/** Whether a circuit that ran this long is saved (Circ1 (A), (K)). */
export function circuitCounts(activeSeconds: number): boolean {
  return Number.isFinite(activeSeconds) && activeSeconds >= CIRCUIT_MIN_SECONDS;
}

/**
 * The 2024 Adult Compendium of Physical Activities' circuit METs, by the
 * finish's answer (Circ1 (J)): 02035 circuit training, moderate effort,
 * 5.0; 02032 circuit training, body weight, 6.0; 02040 circuit training,
 * vigorous effort, 7.5. Source: Herrmann et al. 2024, J Sport Health Sci,
 * pacompendium.com, Conditioning Exercise.
 */
export const CIRCUIT_MET: Record<CircuitEffort, number> = {
  easy: 5.0,
  right: 6.0,
  hard: 7.5,
};

/**
 * Calories a circuit burned: the Compendium's MET for the effort, times
 * body weight in kg, times hours (Circ1 (J)). Unrated reads as Right.
 * The minutes are the session's active clock. Without a body weight it
 * is 0, as a lift's is.
 */
export function circuitBurn({
  activeSeconds,
  bodyweightKg,
  effort,
}: {
  activeSeconds: number;
  bodyweightKg: number;
  effort?: CircuitEffort;
}): number {
  if (!(bodyweightKg > 0) || !(activeSeconds > 0)) return 0;
  const met = CIRCUIT_MET[effort ?? "right"];
  return Math.round((met * bodyweightKg * activeSeconds) / 3600);
}

/** What a best is judged on: one side fixed, the other measured (Circ1
 *  (2)). */
export interface CircuitResult {
  kind: CircuitKind;
  /** The circuit's id and rung: the fixed side is the same only at the
   *  same rung of the same circuit. */
  circuitId: string;
  level: number;
  /** For time: the seconds the set work took. */
  seconds: number;
  /** AMRAP: whole rounds, then reps into the next. */
  rounds: number;
  reps: number;
  finished: boolean;
}

/**
 * Whether a result beats every earlier one of the same circuit at the
 * same rung (Circ1 (2)). For time: fewer seconds for the work, done in
 * full. AMRAP: more rounds, then more reps, in the same time. Timed
 * intervals have no best, only "done", so this is null for them. A first
 * result is not a best: there is nothing to beat.
 */
export function circuitBest(
  result: CircuitResult,
  earlier: readonly CircuitResult[]
): boolean | null {
  if (result.kind === "intervals") return null;
  const same = earlier.filter(
    (other) =>
      other.kind === result.kind &&
      other.circuitId === result.circuitId &&
      other.level === result.level
  );
  if (result.kind === "for_time") {
    const done = same.filter((other) => other.finished);
    if (!result.finished || done.length === 0) return false;
    return done.every((other) => result.seconds < other.seconds);
  }
  if (same.length === 0) return false;
  return same.every(
    (other) =>
      result.rounds > other.rounds ||
      (result.rounds === other.rounds && result.reps > other.reps)
  );
}

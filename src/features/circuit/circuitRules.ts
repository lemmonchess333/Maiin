/**
 * What a finished circuit counts for (Circ1 (6)): whether it is saved at
 * all, and the calories it burned.
 *
 * A best is v2's, with the kinds that fix one side of the work (for time,
 * AMRAP; Circ1 (2)). When it comes it compares a result only with earlier
 * results of the same circuit at the same rung with the same moves, since
 * a harder move or a stand-in for an injury is other work (Circ1 STATUS,
 * later (5)). A timed circuit is "done", with no best.
 */
import type { CircuitEffort } from "./circuitTypes";

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

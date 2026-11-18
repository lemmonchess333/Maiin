/**
 * A person's circuits so far, as the picker and the finish read them: the
 * rung each built-in circuit is offered at today (Circ1 (7)), and whether
 * a finished one is a first (Circ1 (11), DS4 call 3).
 *
 * Read from the newest workouts, not every one ever saved. Tropos
 * heuristic: `CIRCUIT_HISTORY_WORKOUTS` of them is months of training at
 * any rate a person keeps up, so the ladder has every rung it climbed
 * lately. A circuit last done before them starts again at its first
 * rung, as a return after a long gap should; someone whose last circuit
 * of any kind is that far back gets a first circuit's finish again.
 */
import { doseAt, nextLevel, type CircuitSessionRecord } from "./circuitDose";
import { workoutCircuit, type SavedCircuit } from "./savedCircuit";
import type { Circuit } from "./circuitTypes";

/** How many of the newest workouts the circuit history reads. */
export const CIRCUIT_HISTORY_WORKOUTS = 100;

/** A saved circuit and the day it was done. */
export interface DatedCircuit {
  day: string;
  saved: SavedCircuit;
}

/** The circuits among saved workouts, in the order given (newest first). */
export function savedCircuits(
  workouts: readonly { date: string; format?: unknown; circuit?: unknown }[]
): DatedCircuit[] {
  const circuits: DatedCircuit[] = [];
  for (const workout of workouts) {
    const saved = workoutCircuit(workout);
    if (saved) circuits.push({ day: workout.date, saved });
  }
  return circuits;
}

/** One circuit's sessions, oldest first, as the ladder reads them. */
function ladderRecords(
  circuitId: string,
  newestFirst: readonly DatedCircuit[]
): CircuitSessionRecord[] {
  return newestFirst
    .filter(({ saved }) => saved.circuitId === circuitId)
    .reverse()
    .map(({ saved: { level, effort, finished } }) => ({
      level,
      finished,
      ...(effort ? { effort } : {}),
    }));
}

/** A built-in circuit at the rung its history steers it to (Circ1 (7)). */
export function circuitForToday(
  base: Circuit,
  newestFirst: readonly DatedCircuit[],
  injuries?: readonly string[]
): Circuit {
  return doseAt(base, nextLevel(ladderRecords(base.id, newestFirst)), injuries);
}

/** The last time this circuit was done, or null. */
export function lastTimeOf(
  circuitId: string,
  newestFirst: readonly DatedCircuit[]
): DatedCircuit | null {
  return newestFirst.find(({ saved }) => saved.circuitId === circuitId) ?? null;
}

/**
 * Whether a finished circuit earns the full-screen finish (Circ1 (11),
 * DS4 call 3): only a first circuit in v1. A timed circuit is "done",
 * with no best (Circ1 (2)); a best joins this with v2's kinds, compared
 * against the same circuit at the same rung with the same moves (Circ1
 * STATUS, later (5)).
 */
export function circuitReward(
  newestFirst: readonly DatedCircuit[]
): "first" | null {
  return newestFirst.length === 0 ? "first" : null;
}

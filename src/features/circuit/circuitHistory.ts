/**
 * A person's circuits so far, as the picker and the finish read them: the
 * rung each built-in circuit is offered at today (Circ1 (7)), and whether
 * a finished one is a first or a best (Circ1 (11), DS4 call 3).
 *
 * Read from the newest workouts, not every one ever saved. Tropos
 * heuristic: `CIRCUIT_HISTORY_WORKOUTS` of them is months of training at
 * any rate a person keeps up, so the ladder has every rung it climbed
 * lately; a circuit last done before them starts again at its first rung,
 * as a return after a long gap should, and its next finish counts as a
 * first again.
 */
import { doseAt, nextLevel, type CircuitSessionRecord } from "./circuitDose";
import { circuitBest, type CircuitResult } from "./circuitRules";
import { workoutCircuit, type SavedCircuit } from "./savedCircuit";
import type { Circuit } from "./circuitTypes";

/** How many of the newest workouts the circuit history reads. */
export const CIRCUIT_HISTORY_WORKOUTS = 100;

/** The circuits among saved workouts, in the order given (newest first). */
export function savedCircuits(
  workouts: readonly { format?: unknown; circuit?: unknown }[]
): SavedCircuit[] {
  return workouts
    .map(workoutCircuit)
    .filter((circuit): circuit is SavedCircuit => circuit !== null);
}

/** One circuit's sessions, oldest first, as the ladder reads them. */
function ladderRecords(
  circuitId: string,
  newestFirst: readonly SavedCircuit[]
): CircuitSessionRecord[] {
  return newestFirst
    .filter((saved) => saved.circuitId === circuitId)
    .reverse()
    .map(({ level, effort, finished }) => ({
      level,
      finished,
      ...(effort ? { effort } : {}),
    }));
}

/** A built-in circuit at the rung its history steers it to (Circ1 (7)). */
export function circuitForToday(
  base: Circuit,
  newestFirst: readonly SavedCircuit[],
  injuries?: readonly string[]
): Circuit {
  return doseAt(base, nextLevel(ladderRecords(base.id, newestFirst)), injuries);
}

function asResult(saved: SavedCircuit): CircuitResult {
  return {
    kind: saved.kind,
    circuitId: saved.circuitId,
    level: saved.level,
    seconds: saved.activeSeconds,
    rounds: saved.roundsDone,
    // Reps into an unfinished round are AMRAP's, which v1 does not run.
    reps: 0,
    finished: saved.finished,
  };
}

/**
 * Whether a finished circuit earns the full-screen finish (Circ1 (11),
 * DS4 call 3): a first circuit, or a best where its kind has one. A timed
 * circuit has no best (Circ1 (2)), so for one it is only ever a first.
 */
export function circuitReward(
  finished: SavedCircuit,
  newestFirst: readonly SavedCircuit[]
): "first" | "best" | null {
  if (newestFirst.length === 0) return "first";
  const best = circuitBest(asResult(finished), newestFirst.map(asResult));
  return best ? "best" : null;
}

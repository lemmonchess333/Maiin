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

/** A saved workout, as far as the circuit history reads it. */
interface WorkoutRecord {
  date?: unknown;
  createdAt?: unknown;
  format?: unknown;
  circuit?: unknown;
}

/** When a workout was saved, in ms, or 0 when it does not say. */
function savedAtMs(createdAt: unknown): number {
  if (!createdAt || typeof createdAt !== "object") return 0;
  const at = createdAt as { toMillis?: unknown; seconds?: unknown };
  if (typeof at.toMillis === "function") return Number(at.toMillis()) || 0;
  return typeof at.seconds === "number" ? at.seconds * 1000 : 0;
}

/**
 * The circuits among saved workouts, newest first: by day, then by when
 * each was saved. The read orders by day alone, and two circuits on one
 * day come back in no set order, so the ladder would read them either way
 * round.
 */
export function savedCircuits(
  workouts: readonly WorkoutRecord[]
): SavedCircuit[] {
  const day = (workout: WorkoutRecord) =>
    typeof workout.date === "string" ? workout.date : "";
  return workouts
    .map((workout, index) => ({ workout, index }))
    .sort(
      (a, b) =>
        (day(a.workout) < day(b.workout)
          ? 1
          : day(a.workout) > day(b.workout)
            ? -1
            : 0) ||
        savedAtMs(b.workout.createdAt) - savedAtMs(a.workout.createdAt) ||
        a.index - b.index
    )
    .map(({ workout }) => workoutCircuit(workout))
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

/**
 * Whether a finished circuit earns the full-screen finish (Circ1 (11),
 * DS4 call 3): only a first circuit in v1. A timed circuit is "done",
 * with no best (Circ1 (2)); a best joins this with v2's kinds, compared
 * against the same circuit at the same rung with the same moves (Circ1
 * STATUS, later (5)).
 */
export function circuitReward(
  newestFirst: readonly SavedCircuit[]
): "first" | null {
  return newestFirst.length === 0 ? "first" : null;
}

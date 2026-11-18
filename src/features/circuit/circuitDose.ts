/**
 * The circuit's ladder (Circ1 (7), (I)): an observed-dose ladder, steered
 * by the one-tap Easy / Right / Hard on the finish screen. There is no
 * dose model for conditioning, so the ladder only ever moves one rung
 * from what the person did and said.
 *
 * The rungs, from a built-in circuit at rung 0:
 * - rung 1: one more round;
 * - rungs 2 and 3: 5 seconds more work in each interval;
 * - then one move at a time swapped for its harder variant, in the
 *   circuit's order, while one is allowed for this person.
 *
 * Tropos heuristic: the 5 seconds come out of the rest, so each slot stays
 * a minute (Circ1 (F)) and what rises is the work in it, the circuit's
 * own currency. Only the extra round makes a circuit longer.
 */
import {
  circuitMove,
  harderCircuitMove,
  type CircuitFilter,
} from "./circuitMoves";
import type { Circuit, CircuitEffort } from "./circuitTypes";

/** Seconds of work each of the two work rungs adds (Circ1 (I)). */
export const CIRCUIT_WORK_STEP_SECONDS = 5;

/** How many rungs add work. */
const WORK_RUNGS = 2;

/** The least rest a work rung leaves. Tropos heuristic: time to see the
 *  next move and get into place. */
const MIN_REST_SECONDS = 10;

/** The rung after the extra round and the work rungs: harder moves start
 *  here. */
const FIRST_HARDER_RUNG = 1 + WORK_RUNGS + 1;

/**
 * The moves at each harder rung: which index of the circuit's moves each
 * swaps, in order. A swap is left out when this person may not do the
 * harder move, or when the circuit holds it already, so a round never
 * gains a repeat.
 */
function harderSwaps(
  base: Circuit,
  filter: CircuitFilter
): { index: number; exerciseId: string }[] {
  const swaps: { index: number; exerciseId: string }[] = [];
  const ids = base.moves.map((move) => move.exerciseId);
  base.moves.forEach((move, index) => {
    const harder = harderCircuitMove(move.exerciseId, filter);
    if (!harder || ids.includes(harder)) return;
    ids[index] = harder;
    swaps.push({ index, exerciseId: harder });
  });
  return swaps;
}

/** The filter a circuit's ladder is held to: its own kit and impact, and
 *  the person's injuries. */
function ladderFilter(
  base: Circuit,
  injuries: readonly string[] | undefined
): CircuitFilter {
  return { kit: base.kit, lowImpact: base.lowImpact, injuries };
}

/** The highest rung a circuit has for this person. */
export function circuitTopLevel(
  base: Circuit,
  injuries?: readonly string[]
): number {
  return (
    FIRST_HARDER_RUNG -
    1 +
    harderSwaps(base, ladderFilter(base, injuries)).length
  );
}

/**
 * A circuit at a rung of its ladder. The rung is held between 0 and the
 * top, and the circuit keeps its id and name at every rung: it is the
 * same circuit, done harder.
 */
export function doseAt(
  base: Circuit,
  level: number,
  injuries?: readonly string[]
): Circuit {
  const top = circuitTopLevel(base, injuries);
  const rung = Math.max(0, Math.min(top, Math.floor(level) || 0));
  if (rung === 0) return { ...base, level: 0 };
  const workRungs = Math.min(WORK_RUNGS, rung - 1);
  const extraWork = Math.min(
    workRungs * CIRCUIT_WORK_STEP_SECONDS,
    Math.max(0, base.restSeconds - MIN_REST_SECONDS)
  );
  const moves = [...base.moves];
  const swaps = harderSwaps(base, ladderFilter(base, injuries));
  for (const swap of swaps.slice(0, Math.max(0, rung - FIRST_HARDER_RUNG + 1)))
    moves[swap.index] = circuitMove(swap.exerciseId);
  return {
    ...base,
    rounds: base.rounds + 1,
    workSeconds: base.workSeconds + extraWork,
    restSeconds: base.restSeconds - extraWork,
    moves,
    level: rung,
  };
}

/** One finished circuit, as the ladder reads it. */
export interface CircuitSessionRecord {
  /** The rung it was done at. */
  level: number;
  /** The finish's one tap; absent when the person gave none. */
  effort?: CircuitEffort;
  /** Every interval done. */
  finished: boolean;
}

/**
 * The rung to offer next, from the circuit's sessions, oldest first
 * (Circ1 (I)): Easy climbs a rung, Right climbs after two Rights at a
 * rung, Hard holds, Hard and unfinished steps down one, and no rating
 * holds. Tropos heuristic: an unfinished circuit never climbs, whatever
 * was tapped, since the rung was not all done. The result is not held to
 * the top: `doseAt` does that, for the person's own ladder.
 */
export function nextLevel(history: readonly CircuitSessionRecord[]): number {
  const last = history[history.length - 1];
  if (!last) return 0;
  const level = Math.max(0, Math.floor(last.level) || 0);
  if (last.effort === "hard")
    return last.finished ? level : Math.max(0, level - 1);
  if (!last.finished) return level;
  if (last.effort === "easy") return level + 1;
  if (last.effort !== "right") return level;
  // Rights at this rung, back to the session that reached it.
  let rights = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    if ((Math.floor(record.level) || 0) !== level) break;
    if (record.finished && record.effort === "right") rights += 1;
  }
  return rights >= 2 ? level + 1 : level;
}

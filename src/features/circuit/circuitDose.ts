/**
 * The circuit's ladder (Circ1 (7), (I), amended by STATUS later (1)): an
 * observed-dose ladder, steered by the one-tap Easy / Right / Hard on the
 * finish screen. There is no dose model for conditioning, so the ladder
 * only ever moves one rung from what the person did and said, and a
 * circuit's length never grows by itself: a 10-minute circuit stays about
 * 10 minutes at every rung.
 *
 * The rungs, from a built-in circuit at rung 0:
 * - rungs 1 and 2: 5 seconds more work in each interval, taken from the
 *   rest after it (never below 10 s of rest), so each slot stays a minute
 *   (Circ1 (F)) and what rises is the work in it, the circuit's own
 *   currency;
 * - then one move at a time swapped for its harder variant, in the
 *   circuit's order, while one is allowed for this person.
 *
 * The name and minutes come from the circuit's own seconds at every rung
 * (`circuitName`), so they say what it is.
 */
import { circuitName } from "./builtInCircuits";
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

/** The rung after the work rungs: harder moves start here. */
const FIRST_HARDER_RUNG = WORK_RUNGS + 1;

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
 * top, and the circuit keeps its id and length at every rung: it is the
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
  const workRungs = Math.min(WORK_RUNGS, rung);
  const extraWork = Math.min(
    workRungs * CIRCUIT_WORK_STEP_SECONDS,
    Math.max(0, base.restSeconds - MIN_REST_SECONDS)
  );
  const moves = [...base.moves];
  const swaps = harderSwaps(base, ladderFilter(base, injuries));
  for (const swap of swaps.slice(0, Math.max(0, rung - FIRST_HARDER_RUNG + 1)))
    moves[swap.index] = circuitMove(swap.exerciseId);
  const dosed = {
    ...base,
    workSeconds: base.workSeconds + extraWork,
    restSeconds: base.restSeconds - extraWork,
    moves,
    level: rung,
  };
  return { ...dosed, name: circuitName(dosed) };
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
 * (Circ1 (I), STATUS later (4)): Easy climbs a rung; Right climbs on the
 * second Right in a row at a rung, and a Hard between them starts the
 * count again; Hard holds; Hard and unfinished steps down one; no rating
 * holds. Tropos heuristics: an unrated session neither counts nor breaks
 * the row, since it says nothing either way; and an unfinished circuit
 * never climbs, whatever was tapped, since the rung was not all done. The
 * result is not held to the top: `doseAt` does that, for the person's own
 * ladder.
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
  // Rights in a row at this rung, back to a Hard or the session that
  // reached it.
  let rights = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    if ((Math.floor(record.level) || 0) !== level) break;
    if (record.effort === "hard") break;
    if (record.finished && record.effort === "right") rights += 1;
  }
  return rights >= 2 ? level + 1 : level;
}

/**
 * The built-in circuits (Circ1 (14)): for each kit tier, 10, 20 and 30
 * minutes, each standard and low impact. Timed intervals: 40 seconds of
 * work and 20 of rest, or 30 and 30 at low impact.
 *
 * A circuit is built for the person in front of it: its moves are the
 * first in each slot that their kit, their injuries and the impact they
 * chose allow (`circuitMoves`). Tropos heuristics, where the lock gives
 * no number: the moves in a round, the rounds, and which slot follows
 * which. A round is one minute a move, so a circuit's rounds times its
 * moves is its minutes.
 */
import {
  circuitMove,
  circuitMovesFor,
  type CircuitFilter,
  type CircuitSlot,
} from "./circuitMoves";
import type { Circuit, CircuitKit, CircuitMinutes } from "./circuitTypes";

export const CIRCUIT_MINUTES: readonly CircuitMinutes[] = [10, 20, 30];

/** Work and rest in a standard circuit's interval, in seconds (Circ1
 *  (14)). */
export const STANDARD_INTERVAL = { workSeconds: 40, restSeconds: 20 } as const;

/** Work and rest in a low-impact circuit's interval (Circ1 (14)). */
export const LOW_IMPACT_INTERVAL = {
  workSeconds: 30,
  restSeconds: 30,
} as const;

/**
 * A round's slots, in order, for each length. A slot names its first
 * choice and what stands in when the person has no move for it: pulling
 * needs kit, so without any a hinge takes its place. Legs and arms
 * alternate, and the move that raises the heart rate most closes the
 * round, before the rest that follows it.
 */
const ROUNDS: Record<
  CircuitMinutes,
  { rounds: number; slots: readonly (readonly CircuitSlot[])[] }
> = {
  10: {
    rounds: 2,
    slots: [["legs"], ["push"], ["hinge"], ["core"], ["engine"]],
  },
  20: {
    rounds: 4,
    slots: [["legs"], ["push"], ["pull", "hinge"], ["core"], ["engine"]],
  },
  30: {
    rounds: 5,
    slots: [
      ["legs"],
      ["push"],
      ["hinge"],
      ["core"],
      ["pull", "legs"],
      ["engine", "core"],
    ],
  },
};

/** Where a slot with no move left looks next: the slots with the most
 *  moves that need nothing and hurt nothing. */
const STAND_INS: readonly CircuitSlot[] = ["core", "legs", "hinge", "push"];

/** Which of a slot's moves each length starts from, so the three lengths
 *  are not one circuit at three sizes. The engine slot always takes its
 *  first: at standard impact that is the jump, so a standard circuit and
 *  its low-impact twin differ in more than their clock. */
const FIRST_CHOICE: Record<CircuitMinutes, number> = { 10: 0, 20: 1, 30: 0 };

export function builtInCircuitId(
  kit: CircuitKit,
  minutes: CircuitMinutes,
  lowImpact: boolean
): string {
  return `builtin-${kit}-${minutes}-${lowImpact ? "low" : "standard"}`;
}

/** "20-minute circuit", and "20-minute circuit, low impact". */
export function builtInCircuitName(
  minutes: CircuitMinutes,
  lowImpact: boolean
): string {
  return `${minutes}-minute circuit${lowImpact ? ", low impact" : ""}`;
}

export interface BuiltInCircuitRequest extends CircuitFilter {
  minutes: CircuitMinutes;
}

/**
 * One built-in circuit, built for this person. Its moves are distinct
 * while they have enough to choose from; someone whose injuries leave
 * fewer does one twice in a round rather than a move that is ruled out.
 */
export function builtInCircuit(request: BuiltInCircuitRequest): Circuit {
  const { minutes, kit } = request;
  const lowImpact = request.lowImpact === true;
  const filter: CircuitFilter = { ...request, lowImpact };
  const { rounds, slots } = ROUNDS[minutes];
  const chosen: string[] = [];
  let distinct = 0;
  let repeats = 0;
  const unused = (slot: CircuitSlot) =>
    circuitMovesFor(slot, filter).filter((id) => !chosen.includes(id));
  for (const wanted of slots) {
    const open = [...wanted, ...STAND_INS]
      .map(unused)
      .find((moves) => moves.length > 0);
    if (open) {
      const first = wanted[0] === "engine" ? 0 : FIRST_CHOICE[minutes];
      chosen.push(open[first % open.length]);
      continue;
    }
    // Every allowed move is in the round already: one comes round again.
    // They come back in the order they first ran.
    if (chosen.length === 0) break;
    if (repeats === 0) distinct = chosen.length;
    chosen.push(chosen[repeats % distinct]);
    repeats += 1;
  }
  return {
    id: builtInCircuitId(kit, minutes, lowImpact),
    name: builtInCircuitName(minutes, lowImpact),
    kit,
    minutes,
    lowImpact,
    kind: "intervals",
    ...(lowImpact ? LOW_IMPACT_INTERVAL : STANDARD_INTERVAL),
    rounds,
    moves: chosen.map(circuitMove),
    level: 0,
  };
}

/** A person's six built-in circuits: each length, standard then low
 *  impact (Circ1 (14)). */
export function builtInCircuits(
  filter: Omit<CircuitFilter, "lowImpact">
): Circuit[] {
  return CIRCUIT_MINUTES.flatMap((minutes) => [
    builtInCircuit({ ...filter, minutes, lowImpact: false }),
    builtInCircuit({ ...filter, minutes, lowImpact: true }),
  ]);
}

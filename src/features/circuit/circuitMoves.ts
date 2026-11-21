/**
 * The moves a circuit may hold (Circ1 (9)): released art ∩ the person's
 * kit ∩ their injuries, each tagged high or low impact.
 *
 * A move is here only when it can be done for time, on the floor or with
 * kit held in the hands, with nothing to queue for: no bar, bench, cable
 * or machine. Jumping jacks, high knees, squat jumps and skaters join
 * once they are drawn (Circ1 (9)); until then burpees are the one jump.
 */
import { EXERCISES } from "@/lib/exercises";
import { getReleasedFormArtwork } from "@/lib/formArtwork";
import {
  contraindicatedFor,
  type InjuryCategory,
} from "@/features/program/injurySubstitutions";
import type { CircuitImpact, CircuitKit, CircuitMove } from "./circuitTypes";

/** What a move does in a round. A round alternates them, so no part of
 *  the body works twice running. */
export type CircuitSlot =
  "legs" | "push" | "pull" | "hinge" | "core" | "engine";

interface PoolMove {
  slot: CircuitSlot;
  impact: CircuitImpact;
  /** The next step up, for the ladder's harder rungs (Circ1 (7)). */
  harder?: string;
  /** A progression the ladder reaches, never a circuit's first offer
   *  while its slot has an easier move. Tropos heuristic. */
  stepUp?: true;
  /** Worked one side at a time: the runner says when to switch. */
  sided?: true;
  /** Injuries this move is left out for. These add to the plan's own
   *  injury table (`CONTRAINDICATED`), which names only the lifts a
   *  programme prescribes, so an injury option's words hold inside a
   *  circuit too (Circ1 (H), STATUS later (3)). Tropos heuristic, by
   *  that table's own promises: no squat, lunge or knee drive on a sore
   *  knee, no push-up on a sore shoulder or elbow, no body weight on a
   *  sore wrist, no fast or repeated bending of a sore back, no jump on
   *  any of them. */
  avoid?: readonly InjuryCategory[];
}

const PUSH_UP_AVOID: readonly InjuryCategory[] = ["shoulder", "elbow"];

/**
 * The pool, by slot in the order a circuit tries them. Tropos heuristic:
 * the choice of moves and their order are ours, not a published protocol.
 * Impact follows the usual definition: a move is high impact when both
 * feet leave the floor.
 */
export const CIRCUIT_MOVES: Readonly<Record<string, PoolMove>> = {
  "goblet-squat": { slot: "legs", impact: "low", avoid: ["knee"] },
  "bodyweight-squat": {
    slot: "legs",
    impact: "low",
    harder: "bodyweight-lunge",
    avoid: ["knee"],
  },
  "bodyweight-lunge": { slot: "legs", impact: "low", avoid: ["knee"] },
  "single-leg-calf-raise": { slot: "legs", impact: "low", sided: true },
  // Easiest first: a push-up, then the press, then the harder push-ups
  // the ladder steps up to.
  "push-ups": {
    slot: "push",
    impact: "low",
    harder: "diamond-push-ups",
    avoid: PUSH_UP_AVOID,
  },
  "db-shoulder-press": { slot: "push", impact: "low" },
  "diamond-push-ups": {
    slot: "push",
    impact: "low",
    harder: "pike-push-up",
    stepUp: true,
    avoid: PUSH_UP_AVOID,
  },
  "pike-push-up": {
    slot: "push",
    impact: "low",
    stepUp: true,
    avoid: PUSH_UP_AVOID,
  },
  "db-row": { slot: "pull", impact: "low", sided: true },
  "kettlebell-swing": { slot: "hinge", impact: "low", avoid: ["lower_back"] },
  "db-rdl": { slot: "hinge", impact: "low" },
  "glute-bridge": { slot: "hinge", impact: "low" },
  plank: { slot: "core", impact: "low" },
  "dead-bug": { slot: "core", impact: "low" },
  "bicycle-crunch": {
    slot: "core",
    impact: "low",
    stepUp: true,
    avoid: ["lower_back"],
  },
  "russian-twist": { slot: "core", impact: "low", avoid: ["lower_back"] },
  crunches: { slot: "core", impact: "low", harder: "bicycle-crunch" },
  burpees: {
    slot: "engine",
    impact: "high",
    avoid: ["knee", "wrist", "lower_back", "shoulder", "elbow"],
  },
  "mountain-climbers": {
    slot: "engine",
    impact: "low",
    harder: "burpees",
    avoid: ["wrist", "knee"],
  },
};

/**
 * The kit each tier's circuits use. Each is within what the plan gives
 * that tier (`matchTemplate`'s equipment sets). Tropos heuristic: the
 * smallest tier is "bodyweight, maybe dumbbells", and a circuit for
 * someone with no kit (Circ1 (1)) cannot lean on the maybe, so it is
 * bodyweight only; a full gym adds the kettlebell and nothing a circuit
 * would hold a machine or a rack for.
 */
const KIT: Record<CircuitKit, ReadonlySet<string>> = {
  minimal: new Set(["Bodyweight"]),
  home_gym: new Set(["Bodyweight", "Dumbbells"]),
  full_gym: new Set(["Bodyweight", "Dumbbells", "Kettlebell"]),
};

/** The kit tier a profile's `equipment` names. Without one a circuit
 *  asks for no kit: it is the tier anyone can do. */
export function circuitKit(equipment: string | null | undefined): CircuitKit {
  return equipment === "home_gym" || equipment === "full_gym"
    ? equipment
    : "minimal";
}

const BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export interface CircuitFilter {
  kit: CircuitKit;
  /** The profile's injuries. */
  injuries?: readonly string[];
  /** Leave out every jump. */
  lowImpact?: boolean;
}

/** Whether a circuit may hold a move for this person (Circ1 (9)). */
export function circuitMoveAllowed(
  exerciseId: string,
  { kit, injuries = [], lowImpact = false }: CircuitFilter
): boolean {
  const move = CIRCUIT_MOVES[exerciseId];
  const exercise = BY_ID.get(exerciseId);
  if (!move || !exercise) return false;
  if (!KIT[kit].has(exercise.equipment)) return false;
  if (!getReleasedFormArtwork(exerciseId)) return false;
  if (lowImpact && move.impact === "high") return false;
  if (contraindicatedFor(exerciseId, injuries).length > 0) return false;
  return !(move.avoid ?? []).some((injury) => injuries.includes(injury));
}

/** A slot's moves this person may do, in the order a circuit tries them. */
export function circuitMovesFor(
  slot: CircuitSlot,
  filter: CircuitFilter
): string[] {
  return Object.keys(CIRCUIT_MOVES).filter(
    (id) => CIRCUIT_MOVES[id].slot === slot && circuitMoveAllowed(id, filter)
  );
}

/** A slot's moves a circuit may open on: its step-ups only when the slot
 *  has nothing easier for this person. */
export function circuitStartersFor(
  slot: CircuitSlot,
  filter: CircuitFilter
): string[] {
  const moves = circuitMovesFor(slot, filter);
  const easier = moves.filter((id) => !CIRCUIT_MOVES[id].stepUp);
  return easier.length > 0 ? easier : moves;
}

/** A move as a circuit holds it. Throws for an id outside the pool: a
 *  circuit is built only from it. */
export function circuitMove(exerciseId: string): CircuitMove {
  const move = CIRCUIT_MOVES[exerciseId];
  const exercise = BY_ID.get(exerciseId);
  if (!move || !exercise) throw new Error(`Not a circuit move: ${exerciseId}`);
  return {
    exerciseId,
    name: exercise.name,
    impact: move.impact,
    ...(move.sided ? { sided: true as const } : {}),
  };
}

/** The step up from a move that this person may do, or null. */
export function harderCircuitMove(
  exerciseId: string,
  filter: CircuitFilter
): string | null {
  const harder = CIRCUIT_MOVES[exerciseId]?.harder;
  return harder && circuitMoveAllowed(harder, filter) ? harder : null;
}

/**
 * Circuit mode (Circ1): a way of lifting measured in work per minute, for
 * someone short of time or kit. A circuit is a saved workout with
 * `format: "circuit"` (Circ1 (4)): a method inside lifting, as intervals
 * sit inside running, and never a third sport.
 *
 * This file is the vocabulary. The moves a circuit may hold are in
 * `circuitMoves.ts`, the built-in circuits in `builtInCircuits.ts`, the
 * timer's steps in `circuitSteps.ts`, the ladder in `circuitDose.ts`, the
 * rules for counting and calories in `circuitRules.ts`, and the shape a
 * finished one is stored in in `savedCircuit.ts`.
 */

/**
 * How a circuit is run. v1 has one kind: work and rest on a clock,
 * "done" with no best (Circ1 (2)). v2 makes `Circuit` a union on its kind
 * when for time (fixed work) and AMRAP (fixed time) arrive, each with a
 * best (Circ1 STATUS, later (2)).
 */
export type CircuitKind = "intervals";

/** High impact is a jump: both feet leave the floor (Circ1 (9)). */
export type CircuitImpact = "low" | "high";

/** The one-tap answer on the finish screen (Circ1 (2)). */
export type CircuitEffort = "easy" | "right" | "hard";

/** The kit a circuit is built for: the profile's equipment tiers. */
export type CircuitKit = "minimal" | "home_gym" | "full_gym";

/** The lengths a built-in circuit comes in (Circ1 (14)). */
export type CircuitMinutes = 10 | 20 | 30;

export interface CircuitMove {
  /** An exercise id from `src/lib/exercises.ts`. */
  exerciseId: string;
  name: string;
  impact: CircuitImpact;
  /** Worked one side at a time: the runner says when to switch, halfway
   *  through the interval. */
  sided?: true;
}

/** A circuit as the timer runs it: its moves in order, round after round. */
export interface Circuit {
  /** Stable for one built-in circuit at every rung of its ladder. */
  id: string;
  name: string;
  kit: CircuitKit;
  minutes: CircuitMinutes;
  lowImpact: boolean;
  kind: CircuitKind;
  /** Seconds of work in each interval. */
  workSeconds: number;
  /** Seconds of rest after each interval but the last. */
  restSeconds: number;
  rounds: number;
  moves: CircuitMove[];
  /** The rung of its ladder it is at (Circ1 (7)); 0 is the circuit as
   *  first offered. */
  level: number;
}

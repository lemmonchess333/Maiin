/**
 * The words circuit mode shows (Circ1 (1), (10), (11), (A)), in one place
 * so the house voice is held in one file: what a circuit is, where you are
 * in it, and what the finish says. A circuit is sold as what it is,
 * fitness in less time or with no kit (Circ1 (1)), and never for the
 * weight it takes off: the deficit does that, not the method.
 */
import { CIRCUIT_MIN_SECONDS } from "./circuitRules";
import { circuitSeconds, type CircuitStep } from "./circuitSteps";
import type { Circuit, CircuitEffort, CircuitKit } from "./circuitTypes";

/** What a circuit asks for, by kit tier (Circ1 (D)). */
export function circuitKitLine(kit: CircuitKit): string {
  if (kit === "full_gym") return "Bodyweight, dumbbells and a kettlebell";
  if (kit === "home_gym") return "Bodyweight and dumbbells";
  return "Bodyweight only";
}

/** "10 min · 5 moves · 2 rounds · 40 s on, 20 s off": the circuit as it
 *  runs today, its rung's extra round and work included. The minutes are
 *  its clock, without the count in. */
export function circuitShapeLine(circuit: Circuit): string {
  const moves = circuit.moves.length;
  return [
    `${circuitMinutes(circuitSeconds(circuit))} min`,
    `${moves} ${moves === 1 ? "move" : "moves"}`,
    `${circuit.rounds} ${circuit.rounds === 1 ? "round" : "rounds"}`,
    `${circuit.workSeconds} s on, ${circuit.restSeconds} s off`,
  ].join(" · ");
}

/** The step's eyebrow on the runner. */
export function circuitStepEyebrow(kind: CircuitStep["kind"]): string {
  if (kind === "ready") return "Get ready";
  return kind === "work" ? "Work" : "Rest";
}

/** The move the step shows: the one worked, or the one next. */
export function circuitStepHeading(step: CircuitStep): string {
  return step.kind === "work" ? step.move.name : `Next: ${step.move.name}`;
}

/** "Round 2 of 4 · Move 3 of 5". */
export function circuitPlaceLine(circuit: Circuit, step: CircuitStep): string {
  const moves = circuit.moves.length;
  const interval = step.kind === "work" ? step.interval : step.interval + 1;
  const move = ((Math.max(1, interval) - 1) % Math.max(1, moves)) + 1;
  const round = Math.min(
    circuit.rounds,
    Math.floor((Math.max(1, interval) - 1) / Math.max(1, moves)) + 1
  );
  return `Round ${round} of ${circuit.rounds} · Move ${move} of ${moves}`;
}

/** Whole minutes of a session clock, at least 1 once it has run. */
export function circuitMinutes(activeSeconds: number): number {
  if (!(activeSeconds > 0)) return 0;
  return Math.max(1, Math.round(activeSeconds / 60));
}

const MIN_MINUTES = CIRCUIT_MIN_SECONDS / 60;

/** The end question's line (Circ1 (A)): what was done, and whether it
 *  can be saved. Nothing is saved until the finish's Save. */
export function circuitEndLine(activeSeconds: number, saves: boolean): string {
  const done = `You’ve done ${circuitMinutes(activeSeconds)} min.`;
  return saves
    ? `${done} You can save it as it stands.`
    : `${done} A circuit saves from ${MIN_MINUTES} min, so this one won’t be saved.`;
}

/** The finish's line for a circuit that ran under 7 minutes. */
export function circuitTooShortLine(activeSeconds: number): string {
  return `You did ${circuitMinutes(activeSeconds)} min. A circuit saves from ${MIN_MINUTES} min.`;
}

export const CIRCUIT_EFFORTS: readonly {
  effort: CircuitEffort;
  label: string;
}[] = [
  { effort: "easy", label: "Easy" },
  { effort: "right", label: "Right" },
  { effort: "hard", label: "Hard" },
];

/** What a spoken cue says as the circuit ends. Coach speech, as the run's
 *  cues are. */
export const CIRCUIT_DONE_CUE = "Circuit done.";

/** The caption under the finish's minutes: "min · 4 rounds of 5 moves". */
export function circuitFinishCaption(
  roundsDone: number,
  moves: number
): string {
  return `min · ${roundsDone} ${roundsDone === 1 ? "round" : "rounds"} of ${moves} ${moves === 1 ? "move" : "moves"}`;
}

/** The reward's one sentence for a first circuit (DS4 call 3), its
 *  figure apart so the finish can draw it in lifting's colour. */
export const CIRCUIT_FIRST_LINE = {
  before: "Your ",
  figure: "first",
  after: " circuit, done.",
} as const;

/** Under a one-sided move: when to change side. */
export const CIRCUIT_SIDED_LINE = "Switch sides halfway";

/** What is said halfway through a one-sided move. */
export const CIRCUIT_SWITCH_CUE = "Switch sides.";

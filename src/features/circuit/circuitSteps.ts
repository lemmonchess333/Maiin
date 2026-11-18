/**
 * A circuit as the timer walks it (Circ1 (10)): a short count in, then
 * work and rest, move after move and round after round. The steps become
 * the `SessionSegment`s `useSessionPlayer` already plays for a run, so a
 * circuit adds data and no second timer.
 */
import type { SessionSegment } from "@/lib/runSegments";
import type { Circuit, CircuitMove } from "./circuitTypes";

/** Seconds to get into place before the first move. Tropos heuristic. */
export const CIRCUIT_READY_SECONDS = 10;

export interface CircuitStep {
  kind: "ready" | "work" | "rest";
  seconds: number;
  /** The move worked, or for a rest and the count in, the move next. */
  move: CircuitMove;
  /** The round it belongs to, from 1. */
  round: number;
  /** The work interval it is or follows, from 1; 0 for the count in. */
  interval: number;
}

/** How many work intervals a circuit holds. */
export function circuitIntervals(circuit: Circuit): number {
  return circuit.rounds * circuit.moves.length;
}

/** A circuit's clock time in seconds, without the count in: every
 *  interval's work, and the rest between them. No rest follows the last. */
export function circuitSeconds(circuit: Circuit): number {
  const intervals = circuitIntervals(circuit);
  if (intervals === 0) return 0;
  return (
    intervals * circuit.workSeconds + (intervals - 1) * circuit.restSeconds
  );
}

export function circuitSteps(circuit: Circuit): CircuitStep[] {
  const { moves, rounds, workSeconds, restSeconds } = circuit;
  if (moves.length === 0 || rounds <= 0) return [];
  const steps: CircuitStep[] = [
    {
      kind: "ready",
      seconds: CIRCUIT_READY_SECONDS,
      move: moves[0],
      round: 1,
      interval: 0,
    },
  ];
  const total = rounds * moves.length;
  for (let i = 0; i < total; i++) {
    const round = Math.floor(i / moves.length) + 1;
    steps.push({
      kind: "work",
      seconds: workSeconds,
      move: moves[i % moves.length],
      round,
      interval: i + 1,
    });
    if (i + 1 < total && restSeconds > 0)
      steps.push({
        kind: "rest",
        seconds: restSeconds,
        move: moves[(i + 1) % moves.length],
        round,
        interval: i + 1,
      });
  }
  return steps;
}

/** What is said as a step starts. Spoken cues are coach speech, short
 *  enough to finish before the work does. */
function stepCue(step: CircuitStep, circuit: Circuit): string {
  if (step.kind === "ready") return `First up, ${step.move.name}. Get ready.`;
  if (step.kind === "rest") return `Rest. Next, ${step.move.name}.`;
  const last = step.interval === circuitIntervals(circuit);
  return last ? `Last one. ${step.move.name}. Go.` : `${step.move.name}. Go.`;
}

/**
 * The steps as the session player's segments. Work is `hard`, the type
 * the player counts as work, and a rest is `recovery`.
 */
export function circuitSegments(
  circuit: Circuit,
  steps: readonly CircuitStep[] = circuitSteps(circuit)
): SessionSegment[] {
  const total = circuitIntervals(circuit);
  return steps.map((step) => ({
    type:
      step.kind === "work"
        ? "hard"
        : step.kind === "rest"
          ? "recovery"
          : "warmup",
    label: step.kind === "work" ? step.move.name : "Rest",
    instruction:
      step.kind === "work" ? step.move.name : `Next: ${step.move.name}`,
    target: { kind: "duration", seconds: step.seconds },
    ...(step.kind === "work" ? { rep: step.interval, totalReps: total } : {}),
    cue: stepCue(step, circuit),
  }));
}

/** What of a circuit has been done at a point on the timer. */
export interface CircuitProgress {
  /** Work intervals finished. */
  intervalsDone: number;
  /** Rounds finished, every move of each. */
  roundsDone: number;
  /** Seconds worked, the interval under way included. */
  workSecondsDone: number;
  /** Every interval finished. */
  complete: boolean;
}

/**
 * Progress from where the player stands: the index of its live step (the
 * steps' length once complete) and the seconds into it.
 */
export function circuitProgress(
  circuit: Circuit,
  steps: readonly CircuitStep[],
  index: number,
  secondsIntoStep: number
): CircuitProgress {
  const moves = circuit.moves.length;
  const passed = steps.slice(0, Math.max(0, index));
  const finishedWork = passed.filter((step) => step.kind === "work");
  const live = index >= 0 && index < steps.length ? steps[index] : null;
  const liveWork =
    live?.kind === "work"
      ? Math.max(0, Math.min(live.seconds, Math.floor(secondsIntoStep)))
      : 0;
  const intervalsDone = finishedWork.length;
  return {
    intervalsDone,
    roundsDone: moves > 0 ? Math.floor(intervalsDone / moves) : 0,
    workSecondsDone:
      finishedWork.reduce((sum, step) => sum + step.seconds, 0) + liveWork,
    complete: steps.length > 0 && index >= steps.length,
  };
}

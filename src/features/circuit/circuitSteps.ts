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

/** What a circuit's clock is made of. */
type CircuitClock = Pick<
  Circuit,
  "moves" | "rounds" | "workSeconds" | "restSeconds"
>;

/** How many work intervals a circuit holds. */
export function circuitIntervals(circuit: CircuitClock): number {
  return circuit.rounds * circuit.moves.length;
}

/** A circuit's clock time in seconds, without the count in: every
 *  interval's work, and the rest between them. No rest follows the last. */
export function circuitSeconds(circuit: CircuitClock): number {
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
    label:
      step.kind === "work"
        ? step.move.name
        : step.kind === "rest"
          ? "Rest"
          : "Get ready",
    instruction:
      step.kind === "work" ? step.move.name : `Next: ${step.move.name}`,
    target: { kind: "duration", seconds: step.seconds },
    ...(step.kind === "work" ? { rep: step.interval, totalReps: total } : {}),
    cue: stepCue(step, circuit),
  }));
}

/** What of a circuit was done. */
export interface CircuitProgress {
  /** Work intervals run in full. */
  intervalsDone: number;
  /** Rounds with every interval run in full. */
  roundsDone: number;
  /** Seconds of work run, an interval cut short included. */
  workSecondsDone: number;
  /** Every interval run in full: the circuit was done, not skipped to
   *  its end. */
  complete: boolean;
}

/**
 * The seconds the runner spent in each step, from the moments the
 * session player started them (its checkpoint's `segmentStarts`) and the
 * clock now. A step not reached ran none; a step skipped ran only until
 * the skip.
 */
export function stepSecondsRan(
  starts: readonly { elapsed: number }[],
  stepCount: number,
  now: number
): number[] {
  return Array.from({ length: stepCount }, (_, i) => {
    const from = starts[i];
    if (!from) return 0;
    const to = starts[i + 1]?.elapsed ?? now;
    return Math.max(0, to - from.elapsed);
  });
}

/**
 * What of a circuit was done, from the seconds run in each step: only
 * work actually run counts, so skipping to the end is not finishing it
 * (and does not climb the ladder). Tropos heuristic: an interval is done
 * when its whole work ran; one cut short adds its seconds and no more.
 */
export function circuitProgress(
  circuit: Circuit,
  steps: readonly CircuitStep[],
  ranSeconds: readonly number[]
): CircuitProgress {
  const doneByRound = new Map<number, number>();
  let intervalsDone = 0;
  let workSecondsDone = 0;
  steps.forEach((step, i) => {
    if (step.kind !== "work") return;
    const ran = Math.max(0, Math.min(step.seconds, ranSeconds[i] ?? 0));
    workSecondsDone += ran;
    if (ran < step.seconds) return;
    intervalsDone += 1;
    doneByRound.set(step.round, (doneByRound.get(step.round) ?? 0) + 1);
  });
  const moves = circuit.moves.length;
  const roundsDone = [...doneByRound.values()].filter(
    (done) => moves > 0 && done === moves
  ).length;
  const total = circuitIntervals(circuit);
  return {
    intervalsDone,
    roundsDone,
    workSecondsDone: Math.floor(workSecondsDone),
    complete: total > 0 && intervalsDone === total,
  };
}

/**
 * The moments, on the session clock, at which steps ended between where
 * the player stands and now: the live step's end, then each step's after
 * it, while they fall at or before `now`. The page skips the player to
 * each in turn, so a step ends on time even when the clock jumped (the
 * screen slept, the app was away) rather than at the late tick that
 * noticed. The session player itself starts the next step at the tick it
 * sees, which is right for a run and loses the gap for a circuit.
 */
export function stepEndsPassed(
  stepSeconds: readonly number[],
  index: number,
  stepStartedAt: number,
  now: number
): number[] {
  const ends: number[] = [];
  if (index < 0) return ends;
  let at = stepStartedAt;
  for (let i = index; i < stepSeconds.length; i++) {
    at += Math.max(0, stepSeconds[i]);
    if (at > now) break;
    ends.push(at);
  }
  return ends;
}

/** The second into a work step when its other side starts: halfway, for
 *  a one-sided move; null for any other step. */
export function circuitSwitchAt(step: CircuitStep): number | null {
  return step.kind === "work" && step.move.sided
    ? Math.floor(step.seconds / 2)
    : null;
}

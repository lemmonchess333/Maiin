/**
 * A finished circuit as its saved workout keeps it (Circ1 (4), (B)): the
 * workout carries `format: "circuit"` and this under `circuit`, and its
 * `exercises` stay empty, so timed intervals make no false bests,
 * last-time prefills or hard-set volume for the readers of lifts.
 */
import type {
  Circuit,
  CircuitEffort,
  CircuitImpact,
  CircuitKind,
  CircuitKit,
  CircuitMinutes,
  CircuitMove,
} from "./circuitTypes";

/** The workout field that marks a circuit (Circ1 (4)). */
export const CIRCUIT_FORMAT = "circuit";

/**
 * A move as the workout stores it. The entry says what kind of step it
 * is and what unit its target is in, so a later build can store other
 * steps beside it without reshaping saved circuits: a rest or a run as a
 * step, a target in reps or metres, a load (the hybrid session to come,
 * Hyb1). v1 stores moves timed in seconds, its rests in `restSeconds`.
 */
export interface SavedCircuitMove extends CircuitMove {
  kind: "move";
  unit: "seconds";
  /** Kilograms held, when a later build records them. */
  loadKg?: number;
}

export interface SavedCircuit {
  /** The circuit's id, the same at every rung of its ladder. */
  circuitId: string;
  name: string;
  kind: CircuitKind;
  kit: CircuitKit;
  minutes: CircuitMinutes;
  lowImpact: boolean;
  /** The rung it was done at (Circ1 (7)). */
  level: number;
  workSeconds: number;
  restSeconds: number;
  /** Rounds the circuit asked for. */
  rounds: number;
  moves: SavedCircuitMove[];
  /** Work intervals done. */
  intervalsDone: number;
  /** Rounds done, every move of each. */
  roundsDone: number;
  /** Seconds of work done. */
  workSecondsDone: number;
  /** The session clock without pauses or the count in (Circ1 (K)). */
  activeSeconds: number;
  /** Every interval done. */
  finished: boolean;
  /** The finish's one tap (Circ1 (2)); absent when none was given. */
  effort?: CircuitEffort;
}

/** What the runner knows at the finish. */
export interface CircuitOutcome {
  intervalsDone: number;
  roundsDone: number;
  workSecondsDone: number;
  activeSeconds: number;
  finished: boolean;
  effort?: CircuitEffort;
}

/** A circuit and what was done of it, as the workout stores it. */
export function savedCircuitFrom(
  circuit: Circuit,
  outcome: CircuitOutcome
): SavedCircuit {
  return {
    circuitId: circuit.id,
    name: circuit.name,
    kind: circuit.kind,
    kit: circuit.kit,
    minutes: circuit.minutes,
    lowImpact: circuit.lowImpact,
    level: circuit.level,
    workSeconds: circuit.workSeconds,
    restSeconds: circuit.restSeconds,
    rounds: circuit.rounds,
    moves: circuit.moves.map(({ exerciseId, name, impact, sided }) => ({
      kind: "move" as const,
      unit: "seconds" as const,
      exerciseId,
      name,
      impact,
      ...(sided ? { sided } : {}),
    })),
    intervalsDone: Math.max(0, Math.floor(outcome.intervalsDone)),
    roundsDone: Math.max(0, Math.floor(outcome.roundsDone)),
    workSecondsDone: Math.max(0, Math.round(outcome.workSecondsDone)),
    activeSeconds: Math.max(0, Math.round(outcome.activeSeconds)),
    finished: outcome.finished,
    ...(outcome.effort ? { effort: outcome.effort } : {}),
  };
}

/** v1's one kind (Circ1 STATUS, later (2)): a stored circuit of any
 *  other kind is from a later build, and this one cannot read it. */
const KINDS: readonly CircuitKind[] = ["intervals"];
const KITS: readonly CircuitKit[] = ["minimal", "home_gym", "full_gym"];
const MINUTES: readonly CircuitMinutes[] = [10, 20, 30];
const EFFORTS: readonly CircuitEffort[] = ["easy", "right", "hard"];
const IMPACTS: readonly CircuitImpact[] = ["low", "high"];

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function readMove(value: unknown): SavedCircuitMove | null {
  if (!value || typeof value !== "object") return null;
  const { kind, unit, loadKg, exerciseId, name, impact, sided } =
    value as Record<string, unknown>;
  if (kind !== "move" || unit !== "seconds") return null;
  if (!isText(exerciseId) || !isText(name)) return null;
  if (!IMPACTS.includes(impact as CircuitImpact)) return null;
  if (sided !== undefined && sided !== true) return null;
  if (loadKg !== undefined && !isCount(loadKg)) return null;
  return {
    kind,
    unit,
    exerciseId,
    name,
    impact: impact as CircuitImpact,
    ...(sided ? { sided: true as const } : {}),
    ...(loadKg !== undefined ? { loadKg } : {}),
  };
}

/**
 * A stored circuit, checked field by field. Null for anything that is not
 * one: a reader shows such a workout as a lift with no exercises rather
 * than trust a field it cannot read.
 */
export function readSavedCircuit(value: unknown): SavedCircuit | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isText(raw.circuitId) || !isText(raw.name)) return null;
  if (!KINDS.includes(raw.kind as CircuitKind)) return null;
  if (!KITS.includes(raw.kit as CircuitKit)) return null;
  if (!MINUTES.includes(raw.minutes as CircuitMinutes)) return null;
  if (typeof raw.lowImpact !== "boolean" || typeof raw.finished !== "boolean")
    return null;
  const counts = [
    raw.level,
    raw.workSeconds,
    raw.restSeconds,
    raw.rounds,
    raw.intervalsDone,
    raw.roundsDone,
    raw.workSecondsDone,
    raw.activeSeconds,
  ];
  if (!counts.every(isCount)) return null;
  if (!Array.isArray(raw.moves) || raw.moves.length === 0) return null;
  const moves = raw.moves.map(readMove);
  if (moves.some((move) => move === null)) return null;
  if (
    raw.effort !== undefined &&
    !EFFORTS.includes(raw.effort as CircuitEffort)
  )
    return null;
  return {
    circuitId: raw.circuitId,
    name: raw.name,
    kind: raw.kind as CircuitKind,
    kit: raw.kit as CircuitKit,
    minutes: raw.minutes as CircuitMinutes,
    lowImpact: raw.lowImpact,
    level: raw.level as number,
    workSeconds: raw.workSeconds as number,
    restSeconds: raw.restSeconds as number,
    rounds: raw.rounds as number,
    moves: moves as SavedCircuitMove[],
    intervalsDone: raw.intervalsDone as number,
    roundsDone: raw.roundsDone as number,
    workSecondsDone: raw.workSecondsDone as number,
    activeSeconds: raw.activeSeconds as number,
    finished: raw.finished,
    ...(raw.effort ? { effort: raw.effort as CircuitEffort } : {}),
  };
}

/** A saved workout's circuit, or null when it is not a circuit or its
 *  circuit cannot be read. */
export function workoutCircuit(workout: {
  format?: unknown;
  circuit?: unknown;
}): SavedCircuit | null {
  return workout.format === CIRCUIT_FORMAT
    ? readSavedCircuit(workout.circuit)
    : null;
}

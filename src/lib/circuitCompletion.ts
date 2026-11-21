/**
 * Finishing a circuit (Circ1 (11)): the saved workout and its save. A
 * circuit is a way of lifting, so it is saved as a workout through the
 * same path a lift takes (`saveFinishedWorkout`: the transaction, the
 * offline queue), with what makes it a circuit:
 *
 * - `format: "circuit"` and the circuit as run under `circuit` (Circ1
 *   (4)); `exercises` empty and no tonnage, so timed intervals make no
 *   false bests, last-time prefills or hard-set volume (Circ1 (B));
 * - `source: "free"` and no programme completion, as an empty workout
 *   has: it moves no plan and never ticks a plan day (Circ1 (C), (6));
 * - calories from the Compendium's circuit METs (Circ1 (J));
 * - nothing under 7 minutes of the session clock (Circ1 (A), (K)).
 */
import { Timestamp } from "firebase/firestore";
import { stripUndefined } from "@/lib/firestoreGuards";
import {
  liftSessionDay,
  liftWorkoutId,
  saveFinishedWorkout,
  type WorkoutSave,
} from "@/lib/liftCompletion";
import { circuitBurn, circuitCounts } from "@/features/circuit/circuitRules";
import {
  CIRCUIT_FORMAT,
  savedCircuitFrom,
  type CircuitOutcome,
} from "@/features/circuit/savedCircuit";
import type { Circuit } from "@/features/circuit/circuitTypes";

/** A finished circuit, as the circuit page hands it over. */
export interface FinishedCircuit {
  uid: string;
  /** Stable across a finish's retries: a retried save writes the same
   *  workout. */
  completionId: string;
  /** When the session started, in ms: the workout is dated by it. */
  startedAt: number;
  circuit: Circuit;
  outcome: CircuitOutcome;
  bodyweightKg: number;
}

export interface CircuitCompletion extends WorkoutSave {
  workoutId: string;
}

/** Thrown for a circuit under 7 minutes: the page says so before it
 *  asks to save, so this is only a guard. */
export const CIRCUIT_TOO_SHORT = "A circuit saves from 7 minutes.";

/** A circuit's saved workout, without the moment it was written. */
export function circuitWorkoutFields(
  finished: FinishedCircuit
): Record<string, unknown> {
  const { circuit, outcome } = finished;
  const saved = savedCircuitFrom(circuit, outcome);
  return stripUndefined({
    date: liftSessionDay(finished.startedAt),
    exercises: [],
    totalCalories: circuitBurn({
      activeSeconds: saved.activeSeconds,
      bodyweightKg: finished.bodyweightKg,
      effort: outcome.effort,
    }),
    burnContext: { bodyweightKg: finished.bodyweightKg },
    durationMinutes: Math.max(1, Math.round(saved.activeSeconds / 60)),
    // The field every server reader of a workout sums: a circuit moves
    // no weight it can count.
    totalVolume: 0,
    notes: circuit.name,
    source: "free",
    completionId: finished.completionId,
    format: CIRCUIT_FORMAT,
    circuit: saved,
  });
}

/**
 * Saves a finished circuit, now or through the offline queue. Throws when
 * it ran under 7 minutes, or when the save fails; the page says so once.
 */
export async function completeCircuit(
  finished: FinishedCircuit
): Promise<CircuitCompletion> {
  if (!circuitCounts(finished.outcome.activeSeconds))
    throw new Error(CIRCUIT_TOO_SHORT);
  const workoutId = liftWorkoutId("free", finished.completionId);
  const data = {
    ...circuitWorkoutFields(finished),
    createdAt: Timestamp.now(),
  };
  // No programme completion: a circuit chosen on the day moves no plan.
  const saved = await saveFinishedWorkout(finished.uid, workoutId, data);
  return { workoutId, ...saved };
}
